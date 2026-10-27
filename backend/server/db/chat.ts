// Persistent Atlas chat history: conversations and their messages, owned by
// the account and cascaded away with it. Repeated writes are de-duplicated
// through the partial unique index on client_msg_id.

import { row, rows, run, count } from "./core";
import type { Param } from "./core";

interface ChatConversationRow {
  id: number;
  owner_user_id: number;
  analysis_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatConversationSummary extends ChatConversationRow {
  message_count: number;
}

export interface ChatMessageRow {
  id: number;
  conversation_id: number;
  role: "user" | "assistant";
  content: string;
  sources: string | null;
  mode: string | null;
  client_msg_id: string | null;
  created_at: string;
}

/** Escape LIKE wildcards so a user's search term is matched literally. */
const ESC = String.fromCharCode(92);
function likeTerm(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => ESC + c)}%`;
}

export async function insertConversation(
  ownerUserId: number,
  analysisId: string | null,
  title: string,
): Promise<ChatConversationRow> {
  const now = new Date().toISOString();
  const inserted = await run(
    `INSERT INTO chat_conversations (owner_user_id, analysis_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    ownerUserId,
    analysisId,
    title.slice(0, 120),
    now,
    now,
  );
  const id = Number(inserted.rows[0]?.id);
  const created = await findConversationRow(ownerUserId, id);
  if (!created) throw new Error("Conversation insert succeeded but the row is unreadable.");
  return created;
}

/** Conversations for one owner, most recently updated first, optionally
 *  filtered by analysis and/or a title/message-content search. */
export async function listConversationRows(
  ownerUserId: number,
  opts: { analysisId?: string; query?: string; limit?: number } = {},
): Promise<ChatConversationSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const params: Param[] = [ownerUserId];
  let where = "WHERE c.owner_user_id = ?";
  if (opts.analysisId) {
    where += " AND c.analysis_id = ?";
    params.push(opts.analysisId);
  }
  if (opts.query) {
    // SEARCH_TERMS is inlined as placeholders; ESCAPE below matches the
    // escaped wildcard term produced by likeTerm().
    where +=
      " AND (c.title ILIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id AND m.content ILIKE ? ESCAPE '\\'))";
    params.push(likeTerm(opts.query), likeTerm(opts.query));
  }
  params.push(limit);
  const found = await rows<ChatConversationSummary>(
    `SELECT c.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS message_count
       FROM chat_conversations c ${where}
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT ?`,
    ...params,
  );
  return found.map((r) => ({ ...r, message_count: Number(r.message_count) }));
}

export async function findConversationRow(ownerUserId: number, id: number): Promise<ChatConversationRow | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  return (
    (await row<ChatConversationRow>(
      "SELECT * FROM chat_conversations WHERE id = ? AND owner_user_id = ?",
      id,
      ownerUserId,
    )) ?? null
  );
}

export async function renameConversationRow(ownerUserId: number, id: number, title: string): Promise<boolean> {
  const result = await run(
    "UPDATE chat_conversations SET title = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?",
    title.slice(0, 120),
    new Date().toISOString(),
    id,
    ownerUserId,
  );
  return result.changes > 0;
}

export async function deleteConversationRow(ownerUserId: number, id: number): Promise<boolean> {
  if (!Number.isInteger(id) || id <= 0) return false;
  const result = await run(
    "DELETE FROM chat_conversations WHERE id = ? AND owner_user_id = ?",
    id,
    ownerUserId,
  );
  return result.changes > 0;
}

export async function deleteAllConversationRows(ownerUserId: number): Promise<number> {
  const result = await run("DELETE FROM chat_conversations WHERE owner_user_id = ?", ownerUserId);
  return result.changes;
}


/**
 * Append one message. A retry carrying the same `clientMsgId` is a no-op
 * (the partial unique index rejects the duplicate), so repeated requests
 * cannot duplicate messages. Messages without an id always append: there is
 * nothing to de-duplicate against.
 */
export async function insertChatMessage(
  conversationId: number,
  msg: {
    role: "user" | "assistant";
    content: string;
    sources?: string[] | null;
    mode?: string | null;
    clientMsgId?: string | null;
  },
): Promise<boolean> {
  const base = `INSERT INTO chat_messages
         (conversation_id, role, content, sources, mode, client_msg_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const conflict =
    msg.clientMsgId != null
      ? " ON CONFLICT (conversation_id, client_msg_id) WHERE client_msg_id IS NOT NULL DO NOTHING"
      : "";
  const result = await run(
    base + conflict,
    conversationId,
    msg.role,
    msg.content,
    msg.sources && msg.sources.length > 0 ? JSON.stringify(msg.sources) : null,
    msg.mode ?? null,
    msg.clientMsgId ?? null,
    new Date().toISOString(),
  );
  return result.changes > 0;
}

export async function listChatMessageRows(conversationId: number): Promise<ChatMessageRow[]> {
  return rows<ChatMessageRow>(
    "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC",
    conversationId,
  );
}

export async function touchConversationRow(id: number): Promise<void> {
  await run("UPDATE chat_conversations SET updated_at = ? WHERE id = ?", new Date().toISOString(), id);
}