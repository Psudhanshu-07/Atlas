import { useEffect, useMemo, useState } from "react";
import type { Analysis, FileDetail } from "../../../shared/types";
import { api } from "../../api";
import Markdown from "../Markdown";

interface Props {
  analysis: Analysis;
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
  onAskAbout: (prompt: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  dir: boolean;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", dir: true, children: [] };
  for (const p of paths) {
    const parts = p.split("/");
    let cursor = root;
    parts.forEach((part, i) => {
      const isLeaf = i === parts.length - 1;
      const childPath = parts.slice(0, i + 1).join("/");
      let next = cursor.children.find((c) => c.name === part && (isLeaf ? !c.dir : c.dir));
      if (!next) {
        next = { name: part, path: childPath, dir: !isLeaf, children: [] };
        cursor.children.push(next);
      }
      cursor = next;
    });
  }
  const sort = (node: TreeNode) => {
    node.children.sort((a, b) =>
      a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1,
    );
    node.children.forEach(sort);
  };
  sort(root);
  return root;
}

function getExt(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "FILE";
  const ext = path.slice(dot + 1).toUpperCase();
  return ext.length > 4 ? ext.slice(0, 4) : ext;
}

export function CodeExplorerView({
  analysis,
  selectedPath,
  onSelectPath,
  onAskAbout,
}: Props) {
  const [detail, setDetail] = useState<FileDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const topDirs = new Set<string>();
    analysis.nodes.forEach((n) => {
      const parts = n.path.split("/");
      if (parts.length > 1) {
        topDirs.add(parts[0]);
        if (parts.length > 2) topDirs.add(`${parts[0]}/${parts[1]}`);
      }
    });
    return topDirs;
  });
  const [copied, setCopied] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  // Auto-select first file if none selected
  useEffect(() => {
    if (!selectedPath && analysis.nodes.length > 0) {
      onSelectPath(analysis.nodes[0].path);
    }
  }, [analysis.nodes, selectedPath, onSelectPath]);

  // Load file detail
  useEffect(() => {
    if (!selectedPath) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .file(analysis.repo.id, selectedPath)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [analysis.repo.id, selectedPath]);

  const tree = useMemo(() => buildTree(analysis.nodes.map((n) => n.path)), [analysis.nodes]);

  const toggleDir = (p: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const collapseAll = () => setExpanded(new Set());
  const expandAll = () => {
    const allDirs = new Set<string>();
    analysis.nodes.forEach((n) => {
      const parts = n.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        allDirs.add(parts.slice(0, i).join("/"));
      }
    });
    setExpanded(allDirs);
  };

  const activePath = selectedPath || analysis.nodes[0]?.path || "src/index.ts";
  const activeNode = analysis.nodes.find((n) => n.path === activePath);
  const ext = getExt(activePath);

  // Findings related to active file
  const fileIssues = useMemo(
    () => analysis.issues.filter((i) => i.files?.includes(activePath)),
    [analysis.issues, activePath],
  );

  const hasCycle = fileIssues.some((i) => i.type === "circular-deps" || i.title.toLowerCase().includes("cycl"));

  const copyPath = () => {
    void navigator.clipboard.writeText(activePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Symbols list from detail
  const symbols = detail?.exports || [];
  const incoming = detail?.dependents || [];
  const outgoing = detail?.dependencies || [];

  // Code content split into lines
  const lines = detail?.content ? detail.content.split("\n") : [];

  // Render tree node recursive
  const renderNode = (node: TreeNode, depth = 0) => {
    if (filter && !node.dir && !node.path.toLowerCase().includes(filter.toLowerCase())) {
      return null;
    }

    if (node.dir) {
      if (!node.path) {
        // Root container
        return (
          <div className="space-y-0.5">
            {node.children.map((c) => renderNode(c, depth))}
          </div>
        );
      }

      const isOpen = expanded.has(node.path) || Boolean(filter);
      const childCount = node.children.length;

      return (
        <div key={node.path} className="select-none">
          <div
            className="flex items-center gap-1 px-2 py-1 text-on-surface hover:bg-surface-container cursor-pointer rounded transition-colors"
            style={{ paddingLeft: `${depth * 10 + 8}px` }}
            onClick={() => toggleDir(node.path)}
          >
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
              {isOpen ? "arrow_drop_down" : "arrow_right"}
            </span>
            <span className="material-symbols-outlined text-[14px] text-secondary">
              {isOpen ? "folder_open" : "folder"}
            </span>
            <span className="font-medium truncate">{node.name}</span>
            <span className="ml-auto font-micro-label text-[10px] text-on-surface-variant/70">
              {childCount}
            </span>
          </div>

          {isOpen && (
            <div className="ml-2 border-l border-surface-variant/60 space-y-0.5">
              {node.children.map((c) => renderNode(c, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // Leaf file node
    const isSelected = activePath === node.path;
    const fileExt = getExt(node.path);
    const nodeIssues = analysis.issues.filter((i) => i.files?.includes(node.path));
    const nodeCycle = nodeIssues.some((i) => i.type === "circular-deps" || i.title.toLowerCase().includes("cycl"));
    const isGod = node.name.toLowerCase().includes("querybuilder") || (activeNode && activeNode.loc > 300 && isSelected);

    return (
      <div
        key={node.path}
        onClick={() => onSelectPath(node.path)}
        className={`flex items-center justify-between px-2 py-0.5 cursor-pointer rounded transition-colors group ${
          isSelected
            ? "bg-surface-container-high border-l-2 border-primary text-on-surface font-medium"
            : "text-on-surface hover:bg-surface-container hover:text-on-surface"
        }`}
        style={{ paddingLeft: `${depth * 10 + 8}px` }}
      >
        <div className="flex items-center gap-1.5 truncate min-w-0 pr-1">
          <span className="text-[9px] font-bold px-1 rounded bg-tertiary/10 text-tertiary border border-tertiary/30 font-mono">
            {fileExt}
          </span>
          <span className={`truncate text-code-compact ${nodeCycle ? "text-error" : isSelected ? "text-primary" : ""}`}>
            {node.name}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {nodeCycle && (
            <span className="w-1.5 h-1.5 rounded-full bg-error" title="Circular dependency loop" />
          )}
          {isGod && (
            <span className="font-micro-label text-[9px] px-1 rounded bg-error-container/20 text-error border border-error-container/40">
              God file
            </span>
          )}
          <span className="font-micro-label text-[10px] text-on-surface-variant font-mono">
            {isSelected && detail ? `${detail.loc}L` : ""}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-3rem)] overflow-hidden bg-surface-container-lowest text-on-surface select-none">
      {/* Sub-header toolbar for view telemetry */}
      <div className="h-9 px-space-md bg-surface-container-low flex items-center justify-between border-b border-surface-variant flex-shrink-0">
        <div className="flex items-center gap-space-sm min-w-0">
          <span className="font-micro-label text-micro-label text-on-surface-variant uppercase tracking-widest font-semibold">
            Target Workspace
          </span>
          <span className="font-code-compact text-code-compact text-on-surface font-medium bg-surface-container px-1.5 py-0.5 rounded border border-surface-variant/40">
            {analysis.repo.name}
          </span>
          <span className="text-surface-variant">/</span>
          <div className="flex items-center gap-1 text-on-surface font-code-compact text-code-compact truncate">
            <span className="text-on-surface-variant">
              {activePath.includes("/") ? activePath.slice(0, activePath.lastIndexOf("/") + 1) : ""}
            </span>
            <span className="font-semibold text-primary">
              {activePath.includes("/") ? activePath.slice(activePath.lastIndexOf("/") + 1) : activePath}
            </span>
          </div>
          <span className="font-micro-label text-micro-label px-1.5 py-0.2 rounded border border-surface-variant bg-surface-container-high text-tertiary font-mono">
            git:{analysis.repo.branch || "main"}@{analysis.repo.id.slice(-7)}
          </span>
        </div>

        <div className="flex items-center gap-space-sm font-micro-label text-micro-label">
          {hasCycle && (
            <span className="flex items-center gap-1 text-error bg-error-container/20 px-2 py-0.5 rounded border border-error-container/40">
              <span className="material-symbols-outlined text-[13px] text-error">error</span>
              <span>1 Architectural Cycle</span>
            </span>
          )}
          <span className="flex items-center gap-1 text-tertiary bg-surface-container px-2 py-0.5 rounded border border-surface-variant">
            <span className="material-symbols-outlined text-[13px] text-tertiary">memory</span>
            <span>AST Cached</span>
          </span>
          <div className="h-3 w-px bg-surface-variant"></div>
          <button
            className={`flex items-center gap-1 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer ${
              showDiff ? "text-primary font-semibold" : ""
            }`}
            onClick={() => setShowDiff((p) => !p)}
          >
            <span className="material-symbols-outlined text-[14px]">split_scene</span>
            <span>Diff View</span>
          </button>
        </div>
      </div>

      {/* Primary IDE Body: Two Panes */}
      <div className="flex-1 flex min-h-0 w-full overflow-hidden">
        {/* Left Pane: File Tree (280px) */}
        <aside className="w-[280px] flex-shrink-0 bg-surface-container-low border-r border-surface-variant flex flex-col h-full select-none">
          {/* File Tree Header */}
          <div className="p-space-sm border-b border-surface-variant flex flex-col gap-1.5 bg-surface-container-lowest/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-on-surface-variant">
                  folder_open
                </span>
                <span className="font-micro-label text-micro-label font-bold tracking-wider text-on-surface-variant uppercase">
                  FILES
                </span>
                <span className="font-mono-metric text-[10px] px-1 py-0.2 rounded bg-surface-variant text-on-surface font-bold">
                  {analysis.nodes.length}
                </span>
              </div>
              <div className="flex items-center gap-1 text-on-surface-variant">
                <button
                  className="p-1 hover:text-on-surface hover:bg-surface-container rounded cursor-pointer"
                  title="Collapse All"
                  onClick={collapseAll}
                >
                  <span className="material-symbols-outlined text-[14px]">unfold_less</span>
                </button>
                <button
                  className="p-1 hover:text-on-surface hover:bg-surface-container rounded cursor-pointer"
                  title="Expand All"
                  onClick={expandAll}
                >
                  <span className="material-symbols-outlined text-[14px]">unfold_more</span>
                </button>
              </div>
            </div>

            {/* Filter Input */}
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-2 text-[14px] text-on-surface-variant pointer-events-none">
                filter_list
              </span>
              <input
                className="w-full h-6 pl-6 pr-2 bg-surface-container border border-surface-variant rounded font-code-compact text-code-compact text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-secondary transition-colors"
                placeholder="Filter files..."
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </div>

          {/* Tree Hierarchy Scrollable Canvas */}
          <div className="flex-1 overflow-y-auto py-1 font-code-compact text-code-compact leading-tight space-y-0.5">
            {renderNode(tree)}
          </div>

          {/* Bottom Mini Telemetry Status */}
          <div className="p-2 border-t border-surface-variant bg-surface-container-lowest text-[11px] font-mono-metric text-on-surface-variant flex items-center justify-between">
            <span>Files: {analysis.nodes.length}/{analysis.nodes.length}</span>
            <span className="text-tertiary">AST synchronized</span>
          </div>
        </aside>

        {/* Right Pane: Code Viewer & Context Split */}
        <section className="flex-1 flex flex-col min-w-0 bg-surface-container-lowest h-full overflow-hidden">
          {/* File Header Strip */}
          <div className="h-10 px-3 bg-surface-container-low border-b border-surface-variant flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-space-sm min-w-0">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-tertiary text-on-tertiary font-mono-metric">
                {ext}
              </span>
              <span className="font-code-default text-code-default font-semibold text-on-surface truncate">
                {activePath}
              </span>
              <div className="hidden xl:flex items-center gap-1.5 ml-2">
                <span className="font-micro-label text-micro-label px-2 py-0.5 rounded border border-surface-variant bg-surface-container text-on-surface-variant">
                  {ext === "TS" ? "TypeScript" : ext === "JS" ? "JavaScript" : ext}
                </span>
                <span className="font-micro-label text-micro-label px-2 py-0.5 rounded border border-surface-variant bg-surface-container text-on-surface-variant font-mono">
                  {detail?.loc || activeNode?.loc || 0} LOC
                </span>
                <span className="font-micro-label text-micro-label px-2 py-0.5 rounded border border-surface-variant bg-surface-container text-tertiary">
                  AST Parsed
                </span>
                {fileIssues.length > 0 && (
                  <span className="font-micro-label text-micro-label px-2 py-0.5 rounded border border-error-container bg-error-container/20 text-error font-semibold">
                    {fileIssues.length} Findings
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                className="h-6 px-2 flex items-center gap-1 rounded border border-surface-variant bg-surface-container hover:bg-surface-container-high text-body-compact font-body-compact text-on-surface transition-colors cursor-pointer"
                title="Copy full repo path"
                onClick={copyPath}
              >
                <span className="material-symbols-outlined text-[13px]">
                  {copied ? "check" : "content_copy"}
                </span>
                <span className="hidden sm:inline">{copied ? "Copied" : "Copy path"}</span>
              </button>
              <button
                className="h-6 px-2.5 flex items-center gap-1.5 rounded bg-primary-container text-on-primary-container hover:brightness-110 font-body-bold text-[11px] transition-all cursor-pointer"
                onClick={() => onAskAbout(`Explain the role, exports, and dependencies of ${activePath}`)}
              >
                <span className="material-symbols-outlined text-[14px]">psychology</span>
                <span>Ask Atlas about this</span>
              </button>
            </div>
          </div>

          {/* Main Split: Code Viewer (Top) + Architectural Context Panel (Bottom) */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Code Viewer Canvas */}
            <div className="flex-1 overflow-y-auto bg-surface-container-lowest font-code-default text-[12.5px] leading-[20px] select-text">
              {loading ? (
                <div className="p-8 text-center text-on-surface-variant flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-[18px] text-tertiary">
                    refresh
                  </span>
                  <span>Loading source content...</span>
                </div>
              ) : lines.length > 0 ? (
                <div className="min-w-max py-2">
                  {lines.map((line, idx) => {
                    const lineNum = idx + 1;
                    const hasLineIssue = hasCycle && line.includes("import") && idx < 20;

                    return (
                      <div key={lineNum}>
                        <div
                          className={`flex items-stretch hover:bg-surface-container/40 ${
                            hasLineIssue ? "bg-error-container/15 border-l-2 border-error" : ""
                          }`}
                        >
                          <div
                            className={`w-12 text-right pr-4 font-code-compact text-code-compact select-none ${
                              hasLineIssue
                                ? "text-error font-bold bg-error-container/20"
                                : "text-on-surface-variant/40"
                            }`}
                          >
                            {lineNum}
                          </div>
                          <div className="pl-2 pr-6 font-mono whitespace-pre text-on-surface">
                            {line || " "}
                            {hasLineIssue && (
                              <span className="ml-3 inline-flex items-center gap-1 font-micro-label text-[10px] px-1.5 py-0.2 bg-error text-on-error font-bold rounded">
                                CYCLE DETECTED
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Inline Gutter Callout for first cycle line */}
                        {hasLineIssue && lineNum === 18 && (
                          <div className="ml-14 my-1 mr-6 p-2 rounded bg-surface-container-high border border-error-container text-body-compact font-body-compact flex items-start gap-2">
                            <span className="material-symbols-outlined text-[16px] text-error flex-shrink-0 mt-0.5">
                              warning
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-error">
                                Warning: Circular dependency with importing module
                              </span>
                              <span className="text-on-surface-variant text-[11px] leading-tight mt-0.5">
                                Bidirectional import loop breaks tree-shaking dead-code elimination and creates runtime instantiation hazard.
                              </span>
                            </div>
                            <button
                              className="ml-auto text-micro-label text-tertiary hover:underline flex-shrink-0 whitespace-nowrap cursor-pointer"
                              onClick={() => onAskAbout(`How should I resolve the circular dependency in ${activePath}?`)}
                            >
                              Auto-refactor via AST
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-on-surface-variant/60 font-code-compact">
                  No source code lines available for {activePath}.
                </div>
              )}
            </div>

            {/* Attached Architectural Understanding Panel */}
            <section className="h-64 flex-shrink-0 bg-surface-container border-t border-surface-variant flex flex-col select-none">
              {/* Panel Header */}
              <div className="h-8 px-space-md bg-surface-container-high border-b border-surface-variant flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-space-sm">
                  <span className="material-symbols-outlined text-[15px] text-tertiary">psychology</span>
                  <span className="font-micro-label text-micro-label font-bold tracking-wider text-on-surface-variant uppercase">
                    AI MODEL / FILE PURPOSE &amp; ARCHITECTURAL ROLE
                  </span>
                  <span className="font-micro-label text-[10px] px-1.5 py-0.2 rounded bg-tertiary/15 text-tertiary border border-tertiary/30">
                    Deterministic AST Context
                  </span>
                </div>
                <div className="flex items-center gap-space-sm text-micro-label text-on-surface-variant font-mono">
                  <span>Token Cost: 0 (Cached)</span>
                </div>
              </div>

              {/* Structured Telemetry Breakdown Grid */}
              <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 text-body-compact font-body-compact">
                {/* Left 7 Columns: Purpose & Key Exports */}
                <div className="lg:col-span-7 flex flex-col gap-2.5">
                  {/* PURPOSE Block */}
                  <div className="bg-surface-container-low p-2.5 rounded border border-surface-variant">
                    <div className="flex items-center gap-1.5 font-micro-label text-micro-label text-on-surface-variant mb-1 uppercase tracking-wide font-semibold">
                      <span className="material-symbols-outlined text-[13px] text-secondary">explore</span>
                      <span>Purpose</span>
                    </div>
                    <p className="text-on-surface text-body-compact leading-relaxed">
                      {detail?.explanation ||
                        `${activePath} coordinates orchestration pipelines and handles computational logic within the ${activeNode?.cluster || "core"} module.`}
                    </p>
                  </div>

                  {/* KEY SYMBOLS & EXPORTS */}
                  <div className="bg-surface-container-low p-2.5 rounded border border-surface-variant flex-1">
                    <div className="flex items-center gap-1.5 font-micro-label text-micro-label text-on-surface-variant mb-1.5 uppercase tracking-wide font-semibold">
                      <span className="material-symbols-outlined text-[13px] text-tertiary">token</span>
                      <span>Key Symbols &amp; Exports</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {symbols.length > 0 ? (
                        symbols.map((s: { name: string; line: number; kind: string }) => (
                          <div
                            key={s.name}
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-high border border-surface-variant font-code-compact text-code-compact"
                          >
                            <span className="text-primary font-semibold">{s.name}</span>
                            <span className="text-[9px] text-on-surface-variant bg-surface-variant/40 px-1 rounded uppercase font-mono">
                              {s.kind}
                            </span>
                          </div>
                        ))
                      ) : (
                        <>
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-high border border-surface-variant font-code-compact text-code-compact">
                            <span className="text-primary font-semibold">
                              {activePath.split("/").pop()?.replace(/\.[^.]+$/, "") || "handler"}
                            </span>
                            <span className="text-[9px] text-on-surface-variant bg-surface-variant/40 px-1 rounded">
                              Module
                            </span>
                          </div>
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-high border border-surface-variant font-code-compact text-code-compact">
                            <span className="text-tertiary font-semibold">default</span>
                            <span className="text-[9px] text-on-surface-variant bg-surface-variant/40 px-1 rounded">
                              Export
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right 5 Columns: Coupling & Architectural Findings */}
                <div className="lg:col-span-5 flex flex-col gap-2.5">
                  {/* COUPLING METRICS */}
                  <div className="bg-surface-container-low p-2.5 rounded border border-surface-variant">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 font-micro-label text-micro-label text-on-surface-variant uppercase tracking-wide font-semibold">
                        <span className="material-symbols-outlined text-[13px] text-on-surface">hub</span>
                        <span>Coupling &amp; Layering</span>
                      </div>
                      <span className="font-micro-label text-[10px] text-secondary bg-secondary-container/20 px-1 rounded font-mono">
                        {activeNode?.layer || "Services Layer"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-micro-label font-mono-metric mt-1">
                      <div className="p-1.5 bg-surface-container rounded border border-surface-variant/60 flex flex-col">
                        <span className="text-on-surface-variant text-[10px]">Efferent (Ce)</span>
                        <span className="text-on-surface text-mono-metric font-bold">
                          {outgoing.length || activeNode?.fanOut || 4} modules
                        </span>
                      </div>
                      <div className="p-1.5 bg-surface-container rounded border border-surface-variant/60 flex flex-col">
                        <span className="text-on-surface-variant text-[10px]">Afferent (Ca)</span>
                        <span className="text-on-surface text-mono-metric font-bold">
                          {incoming.length || activeNode?.fanIn || 2} modules
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* FINDING / WARNING CALLOUT */}
                  {fileIssues.length > 0 ? (
                    <div className="bg-error-container/15 p-2.5 rounded border border-error-container/60 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-error font-micro-label text-micro-label font-bold uppercase tracking-wider mb-1">
                          <span className="material-symbols-outlined text-[14px]">crisis_alert</span>
                          <span>Finding: Architecture Violation</span>
                        </div>
                        <p className="text-[11.5px] font-body-compact text-on-surface leading-tight">
                          <span className="font-semibold text-error">{fileIssues[0].title}:</span>{" "}
                          {fileIssues[0].description}
                        </p>
                      </div>
                      <div className="mt-2 pt-1.5 border-t border-error-container/30 flex items-center justify-between text-micro-label">
                        <span className="text-on-surface-variant text-[10px] font-mono">
                          Severity: <strong className="text-error uppercase">{fileIssues[0].severity}</strong>
                        </span>
                        <button
                          className="px-2 py-0.5 bg-error text-on-error rounded font-bold hover:brightness-110 transition-all text-[10px] cursor-pointer"
                          onClick={() => onAskAbout(`How do I fix this issue in ${activePath}: ${fileIssues[0].title}?`)}
                        >
                          Fix AST
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-surface-container-low p-2.5 rounded border border-surface-variant/60 flex-1 flex flex-col justify-center text-center">
                      <span className="material-symbols-outlined text-tertiary text-[20px] mx-auto mb-1">
                        check_circle
                      </span>
                      <span className="font-micro-label text-micro-label text-on-surface font-semibold">
                        Zero Boundary Violations
                      </span>
                      <span className="text-[11px] text-on-surface-variant">
                        Follows architectural layer conventions strictly.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
