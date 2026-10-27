// Analysis contract: what the CodeAtlas engine produces for one repository.

import type { FileNode, Edge } from "./code";
import type { Issue } from "./findings";

export type { Severity, IssueType, Issue } from "./findings";
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
