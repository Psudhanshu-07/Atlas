// Findings produced by the analyzers: severity levels, issue taxonomy and the
// issue records shown in reports and file views.

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
