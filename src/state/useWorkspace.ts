// Workspace state for the whole shell: session, loaded analysis, active view,
// selection, the running job and toasts. Components stay presentational, and
// "loading a repository" is decided in exactly one place.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Analysis, AnalysisSummary, DashboardData, SessionUser } from "../../shared/types";
import type { Job } from "../api";
import { api } from "../api";
import { STAGES, type StageState } from "../../shared/progress";
import { plural } from "../../shared/format";
import type { ToastMessage } from "../components/ui/Toast";

export type ViewId =
  | "overview"
  | "repositories"
  | "architecture"
  | "dependencies"
  | "explorer"
  | "assistant"
  | "insights"
  | "docs"
  | "history"
  | "settings";

export const VIEW_TITLES: Record<ViewId, string> = {
  overview: "Overview",
  repositories: "Connect a repository",
  architecture: "Architecture Explorer",
  dependencies: "Dependency Graph",
  explorer: "Code Search & Explorer",
  assistant: "AI Assistant",
  insights: "Architecture Insights",
  docs: "Documentation",
  history: "Analysis History",
  settings: "Settings",
};

/** Views that only make sense once a repository has been analyzed. */
export const VIEWS_NEEDING_REPO: ReadonlySet<ViewId> = new Set<ViewId>([
  "architecture",
  "dependencies",
  "explorer",
  "assistant",
  "insights",
  "docs",
]);

const POLL_INTERVAL_MS = 320;

/** Session state: the shell renders the sign-in screen until "authed". */
export type AuthStatus = "loading" | "anon" | "authed";

export interface AuthProviders {
  github: boolean;
}

/** Friendly copy for the `?github=error:*` return from the OAuth callback. */
function githubErrorText(reason: string): string {
  switch (reason) {
    case "not_configured":
      return "GitHub sign-in is not configured on this server (set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET).";
    case "invalid_state":
      return "GitHub sign-in could not be verified. Try again.";
    default:
      return "GitHub sign-in failed. The server logged the details.";
  }
}

/** Shown between clicking Analyse and the first poll landing. */
function placeholderJob(source: string, message: string, progress: number): Job {
  return {
    id: "pending",
    source,
    status: "running",
    progress,
    message,
    stages: STAGES.map((s): StageState => ({ ...s, state: "pending" })),
    counters: { files: 0, loc: 0, modules: 0, deps: 0, issues: 0, docs: 0 },
  };
}

export function useWorkspace() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [view, setView] = useState<ViewId>("overview");
  const [recent, setRecent] = useState<AnalysisSummary[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Selection lives here so opening a file behaves the same from any view.
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState<string | undefined>(undefined);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const pollTimer = useRef<number | null>(null);
  const autoOpened = useRef(false);

  const busy = job?.status === "running";

  const addToast = useCallback((message: string, type: ToastMessage["type"] = "info", title?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type, title }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshRecent = useCallback(async () => {
    try {
      const r = await api.list();
      setRecent(r.analyses);
      return r.analyses;
    } catch {
      setRecent([]);
      return [];
    }
  }, []);

  /** Workspace totals and connected repositories; always the caller's own rows. */
  const refreshDashboard = useCallback(async () => {
    try {
      setDashboard(await api.dashboard());
    } catch {
      setDashboard(null);
    }
  }, []);

  // Boot, step 1: establish the session before touching any workspace data.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let signedIn: SessionUser | null = null;
      try {
        signedIn = (await api.me()).user;
      } catch {
        signedIn = null;
      }
      if (cancelled) return;
      setUser(signedIn);
      setAuthStatus(signedIn ? "authed" : "anon");

      // The OAuth callback returns with ?github=<status>. Consume it once.
      const params = new URLSearchParams(window.location.search);
      const github = params.get("github");
      if (github) {
        params.delete("github");
        const rest = params.toString();
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
        );
        if (github === "repos" && signedIn) {
          autoOpened.current = true; // don't auto-open a repository over the picker
          setView("repositories");
          addToast("Repository access granted to your GitHub account.", "success", "GitHub connected");
        } else if (github === "signed-in" && signedIn) {
          autoOpened.current = true;
          setView("repositories");
        } else if (github.startsWith("error:")) {
          setError(githubErrorText(github.slice("error:".length)));
        }
      }

      try {
        setProviders(await api.providers());
      } catch {
        /* leave null: the sign-in screen renders its own loading state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addToast]);

  // Boot, step 2 (only once authenticated): AI status, workspace data, history.
  useEffect(() => {
    if (authStatus !== "authed") return;
    let cancelled = false;
    void (async () => {
      try {
        const h = await api.health();
        if (!cancelled) setAiEnabled(h.aiEnabled);
      } catch {
        if (!cancelled) setAiEnabled(false);
      }
      void refreshDashboard();
      try {
        const prefs = await api.getPreferences();
        if (!cancelled) setTheme(prefs.theme);
      } catch {
        /* preferences are a nicety; the local theme stands */
      }
      const list = await refreshRecent();
      if (cancelled || autoOpened.current || list.length === 0) return;
      autoOpened.current = true;
      try {
        const res = await api.get(list[0].id);
        if (!cancelled) setAnalysis(res.analysis);
      } catch {
        /* the cached entry is unreadable; leave the connect screen up */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, refreshRecent, refreshDashboard]);

  // A 401 from any endpoint drops the workspace back to the sign-in screen.
  useEffect(() => {
    const onUnauthorized = () => {
      setAuthStatus((prev) => (prev === "authed" ? "anon" : prev));
      setUser(null);
      setAnalysis(null);
      setRecent([]);
      setDashboard(null);
      setJob(null);
      setView("overview");
      autoOpened.current = false;
      setError("Your session expired. Sign in again.");
    };
    window.addEventListener("codeatlas:unauthorized", onUnauthorized);
    return () => window.removeEventListener("codeatlas:unauthorized", onUnauthorized);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  /** Adopt a fresh session: clear the previous user's workspace state. */
  const beginSession = useCallback((next: SessionUser) => {
    setUser(next);
    setAuthStatus("authed");
    setAnalysis(null);
    setRecent([]);
    setDashboard(null);
    setJob(null);
    setError(null);
    setView("overview");
    autoOpened.current = false;
  }, []);

  const logout = useCallback(async () => {
    stopPolling();
    try {
      await api.logout();
    } catch {
      /* the cookie is cleared locally regardless */
    }
    setUser(null);
    setAuthStatus("anon");
    setAnalysis(null);
    setRecent([]);
    setDashboard(null);
    setJob(null);
    setError(null);
    setView("overview");
    autoOpened.current = false;
  }, [stopPolling]);

  /** Adopt an updated account row (profile edit, GitHub link/unlink). */
  const adoptUser = useCallback((next: SessionUser) => {
    setUser(next);
  }, []);

  /** Create an account with e-mail + password and enter the workspace. */
  const register = useCallback(
    async (email: string, password: string, name?: string): Promise<SessionUser | null> => {
      const r = await api.register(email, password, name);
      setUser(r.user);
      setAuthStatus("authed");
      return r.user;
    },
    [],
  );

  /** Sign in to an existing e-mail + password account. */
  const signIn = useCallback(
    async (email: string, password: string): Promise<SessionUser | null> => {
      const r = await api.login(email, password);
      setUser(r.user);
      setAuthStatus("authed");
      return r.user;
    },
    [],
  );

  /** Poll a job until it settles, then hand the analysis to the workspace. */
  const watchJob = useCallback(
    (jobId: string) => {
      stopPolling();
      const tick = async () => {
        try {
          const next = await api.job(jobId);
          setJob(next);
          if (next.status === "running") {
            pollTimer.current = window.setTimeout(tick, POLL_INTERVAL_MS);
            return;
          }
          if (next.status === "error") {
            setError(next.error ?? "Analysis failed.");
            addToast(next.error ?? "Analysis failed.", "error", "Analysis Failed");
            return;
          }
          const result = next.result;
          if (result) {
            setAnalysis(result.analysis);
            setSelectedModuleId(null);
            setSelectedFilePath(null);
            setSelectedIssueId(null);
            setInspectorOpen(false);
            setView("overview");
            void refreshRecent();
            void refreshDashboard();
            addToast(
              next.message.trim() || `Mapped ${plural(result.analysis.stats.files, "file")}`,
              "success",
              result.cached ? "Loaded cached analysis" : "Analysis complete",
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          addToast(msg, "error", "Analysis Failed");
        }
      };
      void tick();
    },
    [addToast, refreshRecent, refreshDashboard, stopPolling],
  );

  /** Start a fresh analysis of `source`, replacing whatever is on screen. */
  const analyze = useCallback(
    async (source: string, refresh = false, branch?: string) => {
      const trimmed = source.trim();
      if (!trimmed) {
        setError("Enter a GitHub URL, owner/repo, or a local folder path.");
        return;
      }
      setError(null);
      setJob(placeholderJob(trimmed, "Starting analysis…", 0.01));
      try {
        const { jobId } = await api.startAnalyze(trimmed, refresh, branch);
        watchJob(jobId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setJob(null);
        setError(msg);
        addToast(msg, "error", "Analysis Failed");
      }
    },
    [addToast, watchJob],
  );

  /** Open a cached analysis by id (no re-analysis). */
  const openCached = useCallback(
    async (id: string) => {
      setError(null);
      setJob(placeholderJob(id, "Loading cached analysis…", 0.5));
      try {
        const res = await api.get(id);
        setAnalysis(res.analysis);
        setSelectedModuleId(null);
        setSelectedFilePath(null);
        setSelectedIssueId(null);
        setInspectorOpen(false);
        setJob(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setJob(null);
        setError(msg);
        addToast(msg, "error");
      }
    },
    [addToast],
  );

  const reanalyze = useCallback(() => {
    if (analysis) void analyze(analysis.repo.source, true);
  }, [analysis, analyze]);

  const deleteAnalysis = useCallback(
    async (id: string) => {
      try {
        await api.remove(id);
        addToast("Removed the cached analysis.", "info");
        if (analysis?.repo.id === id) {
          setAnalysis(null);
          setView("repositories");
        }
        void refreshRecent();
        void refreshDashboard();
      } catch {
        addToast("Could not delete that cached analysis.", "error");
      } finally {
        setDeleteTarget(null);
      }
    },
    [addToast, analysis, refreshRecent, refreshDashboard],
  );

  // Navigation helpers; these also encode what each view needs.
  const navigate = useCallback(
    (next: ViewId) => {
      if (VIEWS_NEEDING_REPO.has(next) && !analysis) {
        setView("repositories");
        return;
      }
      setView(next);
    },
    [analysis],
  );

  const openFile = useCallback(
    (path: string) => {
      setSelectedFilePath(path);
      setView("explorer");
      // The code explorer has its own inline explanation panel.
      setInspectorOpen(false);
    },
    [],
  );

  const focusModule = useCallback((moduleId: string) => {
    setSelectedModuleId(moduleId);
    setView("architecture");
    setInspectorOpen(false);
  }, []);

  const askAbout = useCallback((prompt: string) => {
    setAssistantPrompt(prompt);
    setView("assistant");
    setInspectorOpen(false);
  }, []);

  const selectIssue = useCallback((issueId: string) => {
    setSelectedIssueId(issueId);
    setInspectorOpen(true);
  }, []);

  const needsRepo = VIEWS_NEEDING_REPO.has(view) && !analysis;

  return useMemo(
    () => ({
      authStatus,
      user,
      providers,
      dashboard,
      analysis,
      view,
      recent,
      aiEnabled,
      job,
      busy,
      error,
      theme,
      toasts,
      deleteTarget,
      selectedModuleId,
      selectedFilePath,
      selectedIssueId,
      assistantPrompt,
      inspectorOpen,
      needsRepo,

      logout,
      adoptUser,
      register,
      signIn,
      navigate,
      analyze,
      openCached,
      reanalyze,
      deleteAnalysis,
      requestDelete: setDeleteTarget,
      cancelDelete: () => setDeleteTarget(null),
      dismissError: () => setError(null),
      setAiEnabled,
      toggleTheme: () => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        if (authStatus === "authed") {
          // Persisted per account; local state already applied, so a failed
          // save only means the choice won't follow the user to another device.
          void api.savePreferences(next).catch((err) => console.debug("theme preference not saved:", err));
        }
      },
      addToast,
      dismissToast,

      openFile,
      focusModule,
      askAbout,
      selectIssue,
      setSelectedModuleId,
      setSelectedFilePath,
      setInspectorOpen,
      refreshRecent,
    }),
    [
      authStatus,
      user,
      providers,
      dashboard,
      analysis,
      view,
      recent,
      aiEnabled,
      job,
      busy,
      error,
      theme,
      toasts,
      deleteTarget,
      selectedModuleId,
      selectedFilePath,
      selectedIssueId,
      assistantPrompt,
      inspectorOpen,
      needsRepo,
      logout,
      adoptUser,
      register,
      signIn,
      navigate,
      analyze,
      openCached,
      reanalyze,
      deleteAnalysis,
      addToast,
      dismissToast,
      openFile,
      focusModule,
      askAbout,
      selectIssue,
      refreshRecent,
    ],
  );
}

export type Workspace = ReturnType<typeof useWorkspace>;