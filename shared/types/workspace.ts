// Workspace model: the signed-in account, connected repositories and what the
// dashboard shows for them.

export interface ApiError {
  error: string;
}

/** The signed-in user, as returned by the auth endpoints. Never carries secrets. */
export interface SessionUser {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  /** True when a GitHub token with the `repo` grant is stored for this account. */
  reposGranted: boolean;
  githubLogin: string | null;
  avatarUrl: string | null;
  /** Short biographical note shown on the account card and in the sidebar. */
  bio: string | null;
  /** User-defined role/designation shown in the sidebar (e.g. "Senior Engineer"). */
  role: string | null;
  /** True when the account has an e-mail/password credential to change. */
  hasPassword: boolean;
  createdAt: string;
}

/** A repository connected to a user's workspace (via GitHub OAuth or a local path). */
export interface LinkedRepo {
  id: number;
  source: string;
  name: string;
  kind: "github" | "local";
  owner?: string;
  branch?: string;
  lastAnalyzedAt: string | null;
  createdAt: string;
}

/** A repository returned by the connected GitHub account's repository list. */
export interface GithubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  description: string | null;
  language: string | null;
  defaultBranch: string;
  updatedAt: string;
  stars: number;
}

/** Everything the dashboard shows, computed from the caller's own rows. */
export interface DashboardData {
  stats: {
    repositories: number;
    analyses: number;
    files: number;
    lines: number;
    findings: number;
  };
  recent: import("./analysis").AnalysisSummary[];
  repos: LinkedRepo[];
}
