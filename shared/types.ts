// Shared contract between the CodeAtlas analysis engine and the web client.

export type Severity = "critical" | "warning" | "info";

export type IssueType =
  | "circular-deps"
  | "layer-violation"
  | "dead-export"
  | "orphan-module"
  | "god-file"
  | "hub-module"
  | "undeclared-dep"
  | "unused-dep"
  | "duplicate-file"
  | "naming-inconsistency"
  | "no-tests"
  | "todo-hotspot";

export interface ImportInfo {
  raw: string;
  line: number;
  resolved?: string;
  external?: string;
}

export interface ExportInfo {
  name: string;
  line: number;
  kind: string;
}

export interface FileNode {
  path: string;
  dir: string;
  name: string;
  language: string;
  loc: number;
  bytes: number;
  imports: ImportInfo[];
  externalImports: string[];
  exports: ExportInfo[];
  cluster: string;
  layer: string;
  fanIn: number;
  fanOut: number;
  entry: boolean;
  test: boolean;
  issueCount: number;
  /** exported symbols with no in-repo consumers */
  deadExports: string[];
}

export interface Edge {
  from: string;
  to: string;
}

export interface Cluster {
  id: string;
  name: string;
  files: number;
  lines: number;
  languages: string[];
  role: string;
  outbound: number;
  inbound: number;
  issues: number;
}

export interface Layer {
  id: string;
  name: string;
  description: string;
  files: number;
}

export interface Issue {
  id: string;
  type: IssueType;
  title: string;
  severity: Severity;
  description: string;
  evidence: string[];
  files: string[];
  fix: string;
}

export interface Doc {
  path: string;
  title: string;
  kind: "architecture" | "module" | "report";
  markdown: string;
}

export interface LanguageStat {
  name: string;
  files: number;
  lines: number;
  color: string;
}

export interface RepoInfo {
  id: string;
  source: string;
  kind: "github" | "local";
  name: string;
  owner?: string;
  branch?: string;
  commit?: string;
  analyzedAt: string;
  rootPath: string;
}

export interface AnalysisStats {
  files: number;
  lines: number;
  dirs: number;
  clusters: number;
  internalDeps: number;
  externalDeps: number;
  issues: number;
  tests: number;
  docs: number;
}

export interface AnalysisTimings {
  crawl: number;
  parse: number;
  analyze: number;
  total: number;
}

export interface Analysis {
  repo: RepoInfo;
  stats: AnalysisStats;
  languages: LanguageStat[];
  nodes: FileNode[];
  edges: Edge[];
  clusters: Cluster[];
  layers: Layer[];
  issues: Issue[];
  docs: Doc[];
  entryPoints: string[];
  cycles: string[][];
  narrative: string;
  narrativeMode: "ai" | "heuristic";
  aiEnabled: boolean;
  warnings: string[];
  timings: AnalysisTimings;
}

/** Lightweight listing used on the import screen. */
export interface AnalysisSummary {
  id: string;
  source: string;
  name: string;
  kind: "github" | "local";
  analyzedAt: string;
  files: number;
  lines: number;
  issues: number;
  language?: string;
  clusters?: number;
}

export interface Annotation {
  line: number;
  message: string;
  kind: IssueType | "note";
}

export interface FileDetail {
  path: string;
  content: string;
  language: string;
  loc: number;
  imports: ImportInfo[];
  exports: ExportInfo[];
  dependents: string[];
  dependencies: string[];
  explanation: string;
  explanationMode: "ai" | "heuristic";
  annotations: Annotation[];
  issues: Issue[];
}

export interface AskAnswer {
  answer: string;
  sources: string[];
  mode: "ai" | "heuristic";
  /** The conversation this exchange was persisted under (ask endpoint). */
  conversationId?: number;
}

/** A persisted Atlas conversation, owned by one account. */
export interface ChatConversation {
  id: number;
  analysisId: string | null;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One stored chat message (user prompt or Atlas response). */
export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  mode?: "ai" | "heuristic";
  createdAt: string;
}

export interface ApiError {
  error: string;
}

/* ------------------------------------------------------------------ account */

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
  recent: AnalysisSummary[];
  repos: LinkedRepo[];
}
