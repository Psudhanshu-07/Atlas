// Per-file code facts shared between the scanner and the explorer UI.

import type { Issue, IssueType } from "./findings";

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

export interface Annotation {
  line: number;
  message: string;
  kind: Issue["type"] | "note";
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
