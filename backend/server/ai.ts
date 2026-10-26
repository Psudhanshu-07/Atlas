// Optional AI layer: provider settings, persistence and one completion helper.
// With a key configured (OpenAI, Gemini, Anthropic, Ollama, OpenRouter) the
// narratives and answers are model-written; without one every caller falls back
// to the deterministic engine.

import * as fs from "node:fs";
import * as path from "node:path";

const TIMEOUT_MS = 60_000;
const PROJECT_ROOT = process.cwd();
const SETTINGS_FILE = path.join(PROJECT_ROOT, ".codeatlas", "settings.json");

export interface AppSettings {
  aiEnabled: boolean;
  provider: "openai" | "gemini" | "anthropic" | "local" | "openrouter" | "custom";
  apiKey?: string;
  baseUrl: string;
  model: string;
  ignorePatterns: string;
  maxDepth: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  aiEnabled: false,
  provider: "openrouter",
  apiKey: undefined,
  baseUrl: "https://openrouter.ai/api/v1",
  // Fast with a large context window; good at explaining code in a human voice.
  model: "google/gemini-2.5-flash",
  ignorePatterns: "node_modules, dist, .git, coverage, .turbo, .next, build",
  maxDepth: 12,
};

let cachedSettings: AppSettings | null = null;

function ensureDirSync(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadSettings(): AppSettings {
  if (cachedSettings) return cachedSettings;

  let loaded: Partial<AppSettings> = {};
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
      loaded = JSON.parse(raw);
    }
  } catch (err) {
    console.error("Failed to load settings file, using defaults:", err);
  }

  // Environment variables take precedence if set. All the spelling people
  // actually use is accepted: OpenAI-style names plus the OpenRouter and
  // Gemini ones, so the provider's own docs copy-paste works as-is.
  const envKey =
    process.env.OPENAI_API_KEY ||
    process.env.CODEATLAS_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GEMINI_API_KEY ||
    "";
  const envBase = process.env.OPENAI_BASE_URL || process.env.OPENROUTER_BASE_URL || "";
  const envModel = process.env.OPENAI_MODEL || process.env.OPENROUTER_MODEL || "";

  // Provider follows the key's shape when nothing was pinned: an `sk-or-…`
  // key is OpenRouter, `AIza…` is Gemini, anything else OpenAI. This keeps a
  // key pasted under an unrelated env name from being sent to the wrong
  // gateway (which silently degrades every answer to the canned fallback).
  const keyForProvider = loaded.apiKey || envKey || "";
  const provider =
    loaded.provider ||
    (keyForProvider.startsWith("AIza")
      ? "gemini"
      : keyForProvider.startsWith("sk-or")
        ? "openrouter"
        : keyForProvider
          ? "openai"
          : "openrouter");
  const apiKey = loaded.apiKey || envKey || undefined;
  let baseUrl = loaded.baseUrl || envBase;
  if (!baseUrl) {
    if (provider === "gemini") {
      baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
    } else if (provider === "local") {
      baseUrl = "http://localhost:11434/v1";
    } else if (provider === "openrouter") {
      baseUrl = "https://openrouter.ai/api/v1";
    } else {
      baseUrl = "https://api.openai.com/v1";
    }
  }

  // Each gateway has its own model namespace, so when no model was
  // configured pick the one that belongs to the gateway, never a model id
  // from another provider's catalog.
  const model =
    loaded.model ||
    envModel ||
    (provider === "openai"
      ? "gpt-4o-mini"
      : provider === "gemini"
        ? "gemini-2.5-flash"
        : DEFAULT_SETTINGS.model);
  const aiEnabled = Boolean(apiKey && apiKey.length > 0) || (provider === "local");

  cachedSettings = {
    ...DEFAULT_SETTINGS,
    ...loaded,
    provider,
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
    model,
    aiEnabled,
  };

  return cachedSettings;
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  // A partial payload carries explicit `undefined` for every field the caller
  // didn't send; those must not wipe existing settings, which a plain spread would.
  const defined = Object.fromEntries(
    Object.entries(partial).filter(([, v]) => v !== undefined),
  ) as Partial<AppSettings>;

  const provider = defined.provider || current.provider;
  let baseUrl = defined.baseUrl || current.baseUrl;

  if (defined.provider && !defined.baseUrl) {
    if (provider === "gemini") {
      baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
    } else if (provider === "local") {
      baseUrl = "http://localhost:11434/v1";
    } else if (provider === "openrouter") {
      baseUrl = "https://openrouter.ai/api/v1";
    } else if (provider === "openai") {
      baseUrl = "https://api.openai.com/v1";
    }
  }

  const apiKey = defined.apiKey !== undefined ? (defined.apiKey.trim() || undefined) : current.apiKey;
  const aiEnabled = Boolean(apiKey && apiKey.length > 0) || (provider === "local");

  const updated: AppSettings = {
    ...current,
    ...defined,
    provider,
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    aiEnabled,
  };

  cachedSettings = updated;

  try {
    ensureDirSync(path.dirname(SETTINGS_FILE));
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write settings file:", err);
  }

  return updated;
}

export interface AiConfig {
  enabled: boolean;
  key?: string;
  base: string;
  model: string;
  provider: string;
}

export function aiConfig(): AiConfig {
  const settings = loadSettings();
  return {
    enabled: settings.aiEnabled,
    key: settings.apiKey,
    base: settings.baseUrl,
    model: settings.model,
    provider: settings.provider,
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type Attempt =
  | { ok: true; content: string }
  | { ok: false; status: number; body: string };

interface AttemptHeaders extends Record<string, string> {}

/**
 * Free-tier OpenRouter models that visitors (unpaid keys) can still use.
 * Verified against the live catalog; first entry is the strongest escape
 * hatch when a configured paid model can no longer run.
 */
const FREE_FALLBACK_MODELS = [
  "poolside/laguna-s-2.1:free",
  "cohere/north-mini-code:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
];

async function attemptModel(
  base: string,
  headers: AttemptHeaders,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<Attempt> {
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        // Low enough to stay factual, high enough not to read like a form letter.
        temperature: 0.4,
        max_tokens: maxTokens,
        messages,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, body };
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (content && content.trim()) return { ok: true, content: content.trim() };
    return { ok: false, status: 500, body: "provider returned an empty choice" };
  } catch (err) {
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Chat completion with optional multi-turn conversation support.
 *
 * On OpenRouter the request walks a short model chain: the configured model
 * first, then free-tier substitutes. A key with no credits (HTTP 402 — paid
 * model) or a congested/rate-limited free model therefore still produces a
 * real answer instead of silently degrading to the canned template.
 * Returns null only when every attempt fails, so callers can fall back to
 * the deterministic engine.
 */
export async function chat(
  system: string,
  messagesOrUser: string | ChatMessage[],
  maxTokens = 2000,
): Promise<string | null> {
  const cfg = aiConfig();
  if (!cfg.enabled) return null;
  if (cfg.provider !== "local" && !cfg.key) return null;

  const messages: ChatMessage[] = [{ role: "system", content: system }];
  if (typeof messagesOrUser === "string") {
    messages.push({ role: "user", content: messagesOrUser });
  } else if (Array.isArray(messagesOrUser)) {
    messages.push(...messagesOrUser);
  }

  const headers: AttemptHeaders = { "content-type": "application/json" };
  if (cfg.key) {
    headers["authorization"] = `Bearer ${cfg.key}`;
  }
  if (cfg.base.includes("openrouter.ai") || cfg.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://codeatlas.dev";
    headers["X-Title"] = "CodeAtlas Intelligence";
  }

  // Model chain, de-duplicated: configured first, then free substitutes.
  // 401 stays terminal — the key itself is wrong; switching models cannot
  // fix auth, and hammering alternates just repeats the rejection.
  const onOpenRouter = cfg.provider === "openrouter";
  const chain = onOpenRouter
    ? [...new Set([cfg.model, ...FREE_FALLBACK_MODELS.filter((m) => m !== cfg.model)])]
    : [cfg.model];

  let lastProblem = "";
  for (const model of chain) {
    const r = await attemptModel(cfg.base, headers, model, messages, maxTokens);
    if (r.ok) {
      if (model !== cfg.model) {
        console.warn(`[AI] served the request with fallback model ${model}`);
      }
      return r.content;
    }
    lastProblem = `HTTP ${r.status}: ${r.body.slice(0, 200)}`;
    if (r.status === 401) {
      console.warn(`[AI] ${model} rejected the key (401) — not trying alternates: ${r.body.slice(0, 200)}`);
      return null;
    }
    if (r.status === 402) {
      console.warn(
        `[AI] ${model} is a paid model but the account has no credits (402) — trying a free-tier model`,
      );
      continue;
    }
    // 429/404/5xx/network/empty: try the next candidate in the chain.
  }
  console.warn(`[AI] every model attempt failed, falling back to deterministic analysis: ${lastProblem}`);
  return null;
}
