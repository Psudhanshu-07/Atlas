// Persistent Atlas chat history.
//
// Conversations and messages live in SQLite, keyed by owner_user_id. Every
// route binds the session's user id in SQL — a client-supplied conversation
// id is useless across accounts, and deletes cascade messages away with the
// conversation (and the account).
//
// The ask handler persists both sides of an exchange: the question is stored
// with the client's msg id (so a retried request cannot duplicate it) and the
// answer with `<clientMsgId>:a`. Follow-up questions read their history from
// the stored conversation, so context survives refreshes and new sessions.

import type { Express, Response } from "express";
import type { ApiError } from "../shared/types";
import { askQuestion } from "./analyze/explain";
import * as db from "./db";
import { loadAnalysisFor } from "./store";
import type { RequestHandler } from "express";

function jsonError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message } satisfies ApiError);
}

/** A readable title from the first question, capped like a chat app's. */
function titleFromQuestion(question: string): string {
  const clean = question.replace(/\s+/g, " ").trim();
  if (!clean) return "New conversation";
  return clean.length > 64 ? `${clean.slice(0, 61)}…` : clean;
}

function conversationJson(row: db.ChatConversationSummary) {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    title: row.title,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function messageJson(row: db.ChatMessageRow) {
  let sources: string[] | undefined;
  if (row.sources) {
    try {
      const parsed = JSON.parse(row.sources) as unknown;
      if (Array.isArray(parsed)) sources = parsed.filter((s): s is string => typeof s === "string");
    } catch {
      /* a corrupt sources blob never breaks the thread */
    }
  }
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    sources,
    mode: row.mode ?? undefined,
    createdAt: row.created_at,
  };
}

/** POST /api/analyses/:id/ask — answer, persisting the exchange. */
export const askHandler: RequestHandler<any> = async (req, res) => {
  try {
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!question) {
      jsonError(res, 400, "Missing question.");
      return;
    }
    if (question.length > 4_000) {
      jsonError(res, 400, "Question is too long (4000 characters max).");
      return;
    }
    const userId = req.user!.id;
    const analysis = loadAnalysisFor(userId, req.params.id);
    if (!analysis) {
      jsonError(res, 404, "Analysis not found.");
      return;
    }

    const requestedId = Number(req.body?.conversationId) || 0;
    const clientMsgId =
      typeof req.body?.clientMsgId === "string" ? req.body.clientMsgId.slice(0, 64) : null;

    let conversation = requestedId ? db.findConversationRow(userId, requestedId) : null;
    if (requestedId && !conversation) {
      jsonError(res, 404, "Conversation not found.");
      return;
    }
    if (conversation && conversation.analysis_id && conversation.analysis_id !== analysis.repo.id) {
      jsonError(res, 400, "That conversation belongs to a different repository.");
      return;
    }

    // Follow-up context comes from the stored conversation when we have one
    // (so it is correct even after a refresh); the client's `history` remains
    // only as a legacy fallback for in-flight conversations.
    let history: Array<{ role: "user" | "assistant"; content: string }> | undefined;
    if (conversation) {
      const stored = db.listChatMessageRows(conversation.id).slice(-8);
      history = stored.map((m) => ({ role: m.role, content: m.content }));
    } else if (Array.isArray(req.body?.history)) {
      history = req.body.history
        .slice(-8)
        .filter(
          (h: unknown): h is { role: "user" | "assistant"; content: string } =>
            Boolean(h) &&
            typeof (h as { role?: unknown }).role === "string" &&
            ["user", "assistant"].includes(String((h as { role: unknown }).role)) &&
            typeof (h as { content?: unknown }).content === "string",
        )
        .map((h: { role: "user" | "assistant"; content: string }) => ({
          role: h.role,
          content: h.content.slice(0, 2_000),
        }));
    }

    const answer = await askQuestion(analysis, analysis.repo.rootPath, question, history);

    if (!conversation) {
      conversation = db.insertConversation(userId, analysis.repo.id, titleFromQuestion(question));
    }
    db.insertChatMessage(conversation.id, {
      role: "user",
      content: question,
      clientMsgId,
    });
    db.insertChatMessage(conversation.id, {
      role: "assistant",
      content: answer.answer,
      sources: answer.sources,
      mode: answer.mode,
      clientMsgId: clientMsgId ? `${clientMsgId}:a` : null,
    });
    db.touchConversationRow(conversation.id);

    res.json({ ...answer, conversationId: conversation.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) res.status(500).json({ error: message } satisfies ApiError);
  }
};

/**
 * Register `/api/chats/*` on the app. Called once from `server/index.ts`
 * before the API 404 handler; `requireAuth` is applied per-route by the caller.
 */
export function registerChatRoutes(app: Express, requireAuth: RequestHandler<any>): void {
  /** List the caller's conversations (optionally scoped/searched). */
  app.get("/api/chats", requireAuth, (req, res) => {
    const analysisId = typeof req.query.analysisId === "string" ? req.query.analysisId : undefined;
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 200) : undefined;
    const conversations = db
      .listConversationRows(req.user!.id, { analysisId, query })
      .map(conversationJson);
    res.json({ conversations });
  });

  /** Download the caller's own chat history as JSON. */
  app.get("/api/chats/export", requireAuth, (req, res) => {
    const conversations = db.listConversationRows(req.user!.id, { limit: 200 }).map((c) => ({
      ...conversationJson(c),
      messages: db.listChatMessageRows(c.id).map(messageJson),
    }));
    res.setHeader("Content-Disposition", 'attachment; filename="atlas-chat-history.json"');
    res.json({ exportedAt: new Date().toISOString(), conversations });
  });

  /** Create an empty conversation (the UI usually lets the ask route make it). */
  app.post("/api/chats", requireAuth, (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const analysisId = typeof req.body?.analysisId === "string" ? req.body.analysisId : null;
    if (!title) {
      jsonError(res, 400, "A title is required.");
      return;
    }
    const created = db.insertConversation(req.user!.id, analysisId, title);
    res.status(201).json({
      conversation: {
        id: created.id,
        analysisId: created.analysis_id,
        title: created.title,
        messageCount: 0,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
    });
  });

  /** One conversation with its full message list. */
  app.get("/api/chats/:id", requireAuth, (req, res) => {
    const conversation = db.findConversationRow(req.user!.id, Number(req.params.id));
    if (!conversation) {
      jsonError(res, 404, "Conversation not found.");
      return;
    }
    const messages = db
      .listChatMessageRows(conversation.id)
      .map(messageJson);
    const messageCount = messages.length;
    res.json({ conversation: { ...conversationJson({ ...conversation, message_count: messageCount }), messages } });
  });

  /** Rename a conversation. */
  app.patch("/api/chats/:id", requireAuth, (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) {
      jsonError(res, 400, "A title is required.");
      return;
    }
    const id = Number(req.params.id);
    const ok = db.renameConversationRow(req.user!.id, id, title);
    if (!ok) {
      jsonError(res, 404, "Conversation not found.");
      return;
    }
    const updated = db.findConversationRow(req.user!.id, id);
    res.json({
      conversation: updated
        ? conversationJson({ ...updated, message_count: db.listChatMessageRows(id).length })
        : null,
    });
  });

  /** Delete one conversation (messages cascade). */
  app.delete("/api/chats/:id", requireAuth, (req, res) => {
    const ok = db.deleteConversationRow(req.user!.id, Number(req.params.id));
    if (!ok) {
      jsonError(res, 404, "Conversation not found.");
      return;
    }
    res.json({ ok: true });
  });

  /** Delete every conversation the caller owns (Data & Privacy section). */
  app.delete("/api/chats", requireAuth, (req, res) => {
    const deleted = db.deleteAllConversationRows(req.user!.id);
    res.json({ deleted });
  });
}
