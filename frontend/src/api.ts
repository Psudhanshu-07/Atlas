// Typed fetch helpers for the CodeAtlas API.
//
// The session travels in an HttpOnly cookie, so same-origin fetches send it
// automatically. Any 401 dispatches `codeatlas:unauthorized` and the workspace
// drops to the sign-in screen instead of rendering stale data.

import type {
  Analysis,
  AnalysisSummary,
  ApiError,
  AskAnswer,
  ChatConversation,
  ChatMessage,
  DashboardData,
  FileDetail,
  GithubRepo,
  SessionUser,
} from "../../shared/types";
import type { JobCounters, JobSnapshot, StageState } from "../../shared/progress";

export type { JobCounters, JobSnapshot, StageState };
export type { DashboardData, GithubRepo, SessionUser };

export interface ConfigResponse {
  ok?: boolean;
  aiEnabled: boolean;
  provider: string;
  apiKey: string;
  hasKey: boolean;
  baseUrl: string;
  model: string;
  ignorePatterns: string;
  maxDepth: number;
}

interface ConfigPayload {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  ignorePatterns?: string;
  maxDepth?: number;
}

/**
 * API origin. Same-origin deployments (the server serving the built client)
 * call relative URLs as before; when the client is hosted separately (Vercel
 * against a Render API), the build gets VITE_API_BASE and calls cross-origin
 * with credentials, which the server allows when CODEATLAS_FRONTEND_URL matches.
 */
const API_BASE = String(import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/** A running (or finished) analysis, polled until it settles. */
export type Job = JobSnapshot;

/** Active sessions for the account settings screen. */
export interface SessionInfo {
  id: number;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string;
  current: boolean;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + url, { ...init, credentials: "include" });
  } catch {
    // Network-level failure (offline, DNS, connection refused). Users get a
    // calm product voice, never a developer's question about ports.
    throw new Error("Atlas is temporarily unreachable. Please try again in a moment.");
  }
  // The API always answers JSON. Anything else (Render's "Service Suspended"
  // page, a 502/503 through a proxy) means the backend is not healthy right
  // now, so say exactly that instead of showing raw HTML leftovers.
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
    throw new Error("Atlas is briefly down for maintenance. Please check back shortly.");
  }
  const json = (await res.json().catch(() => ({}))) as T | ApiError;
  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new Event("codeatlas:unauthorized"));
    }
    throw new Error((json as ApiError).error || `Request failed (${res.status})`);
  }
  return json as T;
}

function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function patch(body: unknown): RequestInit {
  return {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

/** A multipart body for file uploads; the browser sets the boundary header. */
function form(data: FormData): RequestInit {
  return { method: "POST", body: data };
}

/** Absolute URL for an API path — for callers that need the raw Response (downloads). */
export function apiUrl(path: string): string {
  return API_BASE + path;
}

export const api = {
  health: () => request<{ ok: boolean; aiEnabled: boolean; model: string; provider?: string }>("/api/health"),

  /* ------------------------------------------------------------- account */

  /** Boot probe: resolves to null when nobody is signed in. */
  me: () => request<{ user: SessionUser | null }>("/api/auth/me"),

  providers: () => request<{ github: boolean }>("/api/auth/providers"),

  /** Create an account with e-mail + password; returns a signed-in session. */
  register: (email: string, password: string, name?: string) =>
    request<{ user: SessionUser }>("/api/auth/register", post({ email, password, name })),

  /** Sign in to an existing e-mail + password account. */
  login: (email: string, password: string) =>
    request<{ user: SessionUser }>("/api/auth/login", post({ email, password })),

  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  /** Update the general details (name, bio, role). Fields to clear pass "". */
  updateProfile: (name: string, bio?: string, role?: string) =>
    request<{ user: SessionUser }>(
      "/api/auth/profile",
      post({ name, bio: bio ?? undefined, role: role ?? undefined }),
    ),

  /** Upload a profile photo; returns the updated session user. */
  uploadAvatar: (file: File) => {
    const data = new FormData();
    data.append("image", file, file.name || "photo");
    return request<{ user: SessionUser }>("/api/auth/avatar", form(data));
  },

  /** Remove the profile photo. */
  removeAvatar: () => request<{ user: SessionUser }>("/api/auth/avatar", { method: "DELETE" }),

  sessions: () => request<{ sessions: SessionInfo[] }>("/api/auth/sessions"),

  revokeSession: (id: number) => request<{ ok: boolean }>(`/api/auth/sessions/${id}`, { method: "DELETE" }),

  revokeOtherSessions: () => request<{ ok: boolean }>("/api/auth/sessions", { method: "DELETE" }),

  /** Change the password of an e-mail account. */
  changePassword: (current: string, next: string) =>
    request<{ ok: boolean }>("/api/auth/password", post({ current, next })),

  /** Revoke the stored GitHub token (repository access). */
  disconnectGithub: () => request<{ ok: boolean }>("/api/auth/github/disconnect", { method: "POST" }),

  /** Start the GitHub OAuth flow; navigates the browser away (may be cross-origin). */
  githubOAuthUrl: (opts: { scopes?: "identity" | "repos" } = {}) =>
    API_BASE + `/api/auth/github${opts.scopes === "repos" ? "?scopes=repos" : ""}`,

  githubRepos: () => request<{ repos: GithubRepo[]; scopes: string }>("/api/github/repos"),

  dashboard: () => request<DashboardData>("/api/dashboard"),

  getPreferences: () => request<{ theme: "dark" | "light" }>("/api/preferences"),

  savePreferences: (theme: "dark" | "light") =>
    request<{ theme: "dark" | "light" }>("/api/preferences", post({ theme })),

  /* ------------------------------------------------------------ analysis */

  getConfig: () => request<ConfigResponse>("/api/config"),

  updateConfig: (cfg: ConfigPayload) => request<ConfigResponse>("/api/config", post(cfg)),

  /** Kick off an analysis and return the job to watch. */
  startAnalyze: (source: string, refresh = false, branch?: string) =>
    request<{ jobId: string; source: string }>(
      "/api/analyze",
      post({ source, refresh, branch: branch || undefined }),
    ),

  job: (jobId: string) => request<Job>(`/api/jobs/${jobId}`),

  list: () => request<{ analyses: AnalysisSummary[] }>("/api/analyses"),

  get: (id: string) => request<{ analysis: Analysis; cached: boolean }>(`/api/analyses/${id}`),

  remove: (id: string) => request<{ ok: boolean }>(`/api/analyses/${id}`, { method: "DELETE" }),

  file: (id: string, path: string) =>
    request<FileDetail>(`/api/analyses/${id}/file?path=${encodeURIComponent(path)}`),

  ask: (
    id: string,
    question: string,
    opts: {
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      conversationId?: number | null;
      clientMsgId?: string;
    } = {},
  ) =>
    request<AskAnswer>(
      `/api/analyses/${id}/ask`,
      post({
        question,
        history: opts.history,
        conversationId: opts.conversationId ?? undefined,
        clientMsgId: opts.clientMsgId,
      }),
    ),

  /* -------------------------------------------------------- chat history */

  chats: (opts: { analysisId?: string; query?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.analysisId) params.set("analysisId", opts.analysisId);
    if (opts.query) params.set("q", opts.query);
    const qs = params.toString();
    return request<{ conversations: ChatConversation[] }>(`/api/chats${qs ? `?${qs}` : ""}`);
  },

  chat: (conversationId: number) =>
    request<{ conversation: ChatConversation & { messages: ChatMessage[] } }>(
      `/api/chats/${conversationId}`,
    ),

  createChat: (analysisId: string | null, title: string) =>
    request<{ conversation: ChatConversation }>("/api/chats", post({ analysisId, title })),

  renameChat: (conversationId: number, title: string) =>
    request<{ conversation: ChatConversation }>(`/api/chats/${conversationId}`, patch({ title })),

  deleteChat: (conversationId: number) =>
    request<{ ok: boolean }>(`/api/chats/${conversationId}`, { method: "DELETE" }),

  deleteAllChats: () => request<{ deleted: number }>("/api/chats", { method: "DELETE" }),

  /* ---------------------------------------- account export and deletion */

  /** URL of the full personal-data export (fetch it as a JSON download). */
  exportAccountUrl: () => apiUrl("/api/auth/export"),

  /**
   * Permanently delete the account and everything it owns. Re-authentication
   * is required: `password` for e-mail accounts, `confirmEmail` for
   * GitHub-only accounts.
   */
  deleteAccount: (reauth: { password?: string; confirmEmail?: string }) =>
    request<{ ok: boolean }>(
      "/api/auth/account",
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reauth),
      },
    ),

  /* --------------------------------------------------------- telemetry */

  /** Report a product event. Fire-and-forget; errors never surface to the UI. */
  track: (event: string) =>
    request<{ ok: boolean }>("/api/telemetry", post({ event })).catch(() => null),
};