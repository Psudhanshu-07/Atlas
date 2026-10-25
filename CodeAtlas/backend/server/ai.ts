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

  // Deployment environment variables take precedence over saved local settings.
  // OpenRouter has its own key names so it cannot be mistaken for an OpenAI key.
  const envOpenRouterKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  const envOpenAIKey = process.env.OPENAI_API_KEY?.trim() || "";
  const envCodeAtlasKey = process.env.CODEATLAS_API_KEY?.trim() || "";
  const envGeminiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const envKey = envOpenRouterKey || envOpenAIKey || envCodeAtlasKey || envGeminiKey;
  const envBase =
    process.env.OPENROUTER_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "";
  const envModel =
    process.env.OPENROUTER_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "";

  const provider =
    envOpenRouterKey ? "openrouter" :
    envGeminiKey ? "gemini" :
    loaded.provider || (envOpenAIKey || envCodeAtlasKey ? "openai" : "openrouter");
  const apiKey = envKey || loaded.apiKey?.trim() || undefined;
  const hasProviderEnv = Boolean(envOpenRouterKey || envGeminiKey || envOpenAIKey || envCodeAtlasKey);
  let baseUrl = envBase || (hasProviderEnv ? "" : loaded.baseUrl);
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

  const model = envModel || loaded.model || DEFAULT_SETTINGS.model;
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

/**
 * Chat completion with optional multi-turn conversation support.
 * Returns null on any failure so callers can fall back to the deterministic engine.
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

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (cfg.key) {
      headers["authorization"] = `Bearer ${cfg.key}`;
    }
    if (cfg.base.includes("openrouter.ai") || cfg.provider === "openrouter") {
      headers["HTTP-Referer"] = "https://codeatlas.dev";
      headers["X-Title"] = "CodeAtlas Intelligence";
    }

    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: cfg.model,
        // Low enough to stay factual, high enough not to read like a form letter.
        temperature: 0.4,
        max_tokens: maxTokens,
        messages,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[AI] Provider returned HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    return content && content.trim() ? content.trim() : null;
  } catch (err) {
    console.warn("[AI] Chat completion failed, falling back to deterministic analysis:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
