import { useState, useMemo, useEffect } from "react";
import type { Analysis, Doc } from "../../../shared/types";
import Markdown from "../Markdown";
import { Badge, Spinner } from "../ui";
import { FileText, BookOpen, LayoutGrid, FileEdit, RefreshCw, Check, Copy } from "lucide-react";

interface Props {
  analysis: Analysis;
}

const KIND_LABEL: Record<Doc["kind"], string> = {
  architecture: "Architecture Manual",
  module: "Module Subsystems",
  report: "Quality & Security Audits",
};

export function DocumentationWorkspace({ analysis }: Props) {
  const [activePath, setActivePath] = useState(analysis.docs[0]?.path ?? "");
  const [viewMode, setViewMode] = useState<"read" | "diagram" | "edit">("read");
  const [editableMarkdown, setEditableMarkdown] = useState("");
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    setActivePath(analysis.docs[0]?.path ?? "");
  }, [analysis.repo.id, analysis.docs]);

  const activeDoc = analysis.docs.find((d) => d.path === activePath) ?? analysis.docs[0];

  useEffect(() => {
    if (activeDoc) {
      setEditableMarkdown(activeDoc.markdown);
      setViewMode("read");
    }
  }, [activeDoc]);

  const groupedDocs = useMemo(() => {
    const map = new Map<Doc["kind"], Doc[]>();
    for (const d of analysis.docs) {
      const list = map.get(d.kind) ?? [];
      list.push(d);
      map.set(d.kind, list);
    }
    return (["architecture", "module", "report"] as const)
      .map((k) => ({ kind: k, docs: map.get(k) ?? [] }))
      .filter((g) => g.docs.length > 0);
  }, [analysis.docs]);

  // Copy to clipboard
  const handleCopy = async () => {
    if (!editableMarkdown) return;
    try {
      await navigator.clipboard.writeText(editableMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  // Download Markdown file
  const handleDownloadMd = () => {
    if (!activeDoc) return;
    const blob = new Blob([editableMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeDoc.path.split("/").pop() ?? "doc.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download all docs as JSON
  const handleExportJson = () => {
    const data = JSON.stringify(analysis.docs, null, 2);
    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${analysis.repo.name}-documentation.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRegenerate = () => {
    if (!activeDoc) return;
    setRegenerating(true);
    setTimeout(() => {
      setEditableMarkdown(activeDoc.markdown);
      setRegenerating(false);
    }, 450);
  };

  return (
    <div className="documentation-workspace-clean">
      {/* LEFT: Documents Navigation Sidebar */}
      <aside className="docs-clean-sidebar">
        <div className="docs-sidebar-top">
          <h3>DOCUMENTATION MANUAL</h3>
          <span className="docs-count-pill">{analysis.docs.length} guides</span>
        </div>

        <div className="docs-groups-list">
          {groupedDocs.map((group) => (
            <div key={group.kind} className="docs-nav-group-clean">
              <span className="group-heading-text">{KIND_LABEL[group.kind]}</span>
              {group.docs.map((doc) => (
                <button
                  key={doc.path}
                  className={`doc-nav-item-btn ${activeDoc?.path === doc.path ? "active" : ""}`}
                  onClick={() => setActivePath(doc.path)}
                >
                  <span className="doc-icon-bullet" style={{ display: "inline-flex", alignItems: "center" }}>
                    <FileText size={13} />
                  </span>
                  <span className="doc-item-title">{doc.title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="docs-sidebar-footer">
          <button className="btn ghost btn-sm full-width" onClick={handleExportJson}>
            Export All Docs (JSON)
          </button>
        </div>
      </aside>

      {/* RIGHT: Document Main Reader & Diagram Canvas */}
      <main className="docs-clean-main">
        {activeDoc ? (
          <>
            {/* Header Toolbar */}
            <div className="doc-top-toolbar">
              <div className="doc-title-info">
                <span className="doc-kind-badge">{activeDoc.kind.toUpperCase()}</span>
                <h1 className="doc-main-heading">{activeDoc.title}</h1>
                <span className="doc-filepath"><code>{activeDoc.path}</code></span>
              </div>

              <div className="doc-view-switcher">
                <button
                  className={`btn ghost btn-sm ${viewMode === "read" ? "active" : ""}`}
                  onClick={() => setViewMode("read")}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <BookOpen size={13} /> Reading View
                </button>
                <button
                  className={`btn ghost btn-sm ${viewMode === "diagram" ? "active" : ""}`}
                  onClick={() => setViewMode("diagram")}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <LayoutGrid size={13} /> Visual Diagram View
                </button>
                <button
                  className={`btn ghost btn-sm ${viewMode === "edit" ? "active" : ""}`}
                  onClick={() => setViewMode("edit")}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <FileEdit size={13} /> Edit Markdown
                </button>
              </div>

              <div className="doc-action-buttons">
                <button
                  className="btn ghost btn-sm"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  title="Regenerate section from AST"
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
                >
                  {regenerating ? <Spinner size={12} /> : <><RefreshCw size={12} /> Regenerate</>}
                </button>
                <button
                  className="btn ghost btn-sm"
                  onClick={handleCopy}
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
                >
                  {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
                <button className="btn primary btn-sm" onClick={handleDownloadMd}>
                  Download .md
                </button>
              </div>
            </div>

            {/* Document Content Viewport */}
            <div className="doc-viewport-content">
              {/* 1. VISUAL DIAGRAM VIEW */}
              {viewMode === "diagram" && (
                <div className="doc-diagram-container">
                  <div className="doc-diagram-banner">
                    <h3>Visual Architecture Map for {analysis.repo.name}</h3>
                    <p>
                      Generated directly from the codebase's file dependency topology and module declarations.
                    </p>
                  </div>

                  <div className="doc-diagram-grid">
                    {analysis.clusters.map((cluster) => (
                      <div key={cluster.id} className="doc-module-diag-card">
                        <div className="diag-card-head">
                          <strong className="diag-mod-name">{cluster.name}</strong>
                          <Badge variant="accent">{cluster.role}</Badge>
                        </div>
                        <div className="diag-card-body">
                          <div className="diag-metric-row">
                            <span>Files: <strong>{cluster.files}</strong></span>
                            <span>Lines: <strong>{cluster.lines.toLocaleString()}</strong></span>
                          </div>
                          <div className="diag-coupling-row">
                            <span className="in-badge">↓ {cluster.inbound} callers</span>
                            <span className="out-badge">↑ {cluster.outbound} dependencies</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="doc-pipeline-summary-card">
                    <h4>Top Architectural Entry Points</h4>
                    <div className="entry-chips-row">
                      {analysis.entryPoints.map((ep) => (
                        <div key={ep} className="entry-chip-card">
                          <code>{ep}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. EDIT MARKDOWN VIEW */}
              {viewMode === "edit" && (
                <div className="doc-edit-wrapper">
                  <div className="edit-notice-bar">
                    <span>You are editing this document. Changes will be exported when you download or copy.</span>
                  </div>
                  <textarea
                    className="doc-full-textarea"
                    value={editableMarkdown}
                    onChange={(e) => setEditableMarkdown(e.target.value)}
                    spellCheck={false}
                  />
                </div>
              )}

              {/* 3. FORMATTED READING VIEW */}
              {viewMode === "read" && (
                <div className="doc-markdown-reader">
                  <Markdown>{editableMarkdown}</Markdown>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="docs-empty-state">No document selected.</div>
        )}
      </main>
    </div>
  );
}
