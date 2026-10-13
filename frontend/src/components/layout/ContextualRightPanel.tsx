import type { Analysis, Cluster, FileNode, Issue } from "../../../../shared/types";
import { plural } from "../../../../shared/format";
import { SeverityBadge } from "../ui";
import { X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  analysis: Analysis | null;
  selectedModuleId: string | null;
  selectedFilePath: string | null;
  selectedIssueId: string | null;
  onOpenFile: (path: string) => void;
  onFocusModule: (moduleId: string) => void;
  onAskAbout: (prompt: string) => void;
}

export function ContextualRightPanel({
  isOpen,
  onClose,
  analysis,
  selectedModuleId,
  selectedFilePath,
  selectedIssueId,
  onOpenFile,
  onFocusModule,
  onAskAbout,
}: Props) {
  if (!isOpen) return null;

  if (!analysis) {
    return (
      <aside className="contextual-panel" aria-label="Contextual Inspector">
        <div className="panel-header">
          <h3>Inspector</h3>
          <button className="panel-close-btn" onClick={onClose} aria-label="Close Inspector">
            <X size={15} />
          </button>
        </div>
        <div className="panel-body">
          <div className="panel-empty-text">Connect or select a repository to view metadata.</div>
        </div>
      </aside>
    );
  }

  // 1. Selected Issue View
  if (selectedIssueId) {
    const issue = analysis.issues.find((i) => i.id === selectedIssueId);
    if (issue) {
      return (
        <aside className="contextual-panel" aria-label="Issue Inspector">
          <div className="panel-header">
            <div className="header-badge-title">
              <SeverityBadge severity={issue.severity} />
              <h3>Issue Finding</h3>
            </div>
            <button className="panel-close-btn" onClick={onClose} aria-label="Close Inspector">
              <X size={15} />
            </button>
          </div>

          <div className="panel-body">
            <div className="panel-section">
              <h4 className="issue-title-text">{issue.title}</h4>
              <p className="panel-desc">{issue.description}</p>
            </div>

            {issue.evidence.length > 0 && (
              <div className="panel-section">
                <span className="section-label">EVIDENCE & TRACES</span>
                <ul className="evidence-list">
                  {issue.evidence.map((ev, i) => (
                    <li key={i} className="evidence-item">
                      <code>{ev}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {issue.files.length > 0 && (
              <div className="panel-section">
                <span className="section-label">AFFECTED FILES ({issue.files.length})</span>
                <div className="file-chip-list">
                  {issue.files.map((f) => (
                    <button key={f} className="chip file-chip" onClick={() => onOpenFile(f)}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {issue.fix && (
              <div className="panel-section">
                <span className="section-label">RECOMMENDED RESOLUTION</span>
                <div className="fix-box">{issue.fix}</div>
              </div>
            )}

            <div className="panel-actions">
              <button
                className="btn primary full-width"
                onClick={() => onAskAbout(`How should I fix this issue: "${issue.title}" in ${issue.files.join(", ")}?`)}
              >
                Ask Assistant for Refactoring Plan
              </button>
            </div>
          </div>
        </aside>
      );
    }
  }

  // 2. Selected Module View
  if (selectedModuleId) {
    const cluster = analysis.clusters.find((c) => c.id === selectedModuleId);
    if (cluster) {
      const moduleFiles = analysis.nodes.filter((n) => n.cluster === cluster.id);
      const incomingEdges = analysis.edges.filter(
        (e) => analysis.nodes.find((n) => n.path === e.to)?.cluster === cluster.id &&
               analysis.nodes.find((n) => n.path === e.from)?.cluster !== cluster.id
      );
      const outgoingEdges = analysis.edges.filter(
        (e) => analysis.nodes.find((n) => n.path === e.from)?.cluster === cluster.id &&
               analysis.nodes.find((n) => n.path === e.to)?.cluster !== cluster.id
      );

      const incomingClusters = Array.from(
        new Set(incomingEdges.map((e) => analysis.nodes.find((n) => n.path === e.from)?.cluster).filter(Boolean))
      );
      const outgoingClusters = Array.from(
        new Set(outgoingEdges.map((e) => analysis.nodes.find((n) => n.path === e.to)?.cluster).filter(Boolean))
      );

      return (
        <aside className="contextual-panel" aria-label="Module Inspector">
          <div className="panel-header">
            <div>
              <span className="panel-eyebrow">MODULE DETAILS</span>
              <h3>{cluster.name}</h3>
            </div>
            <button className="panel-close-btn" onClick={onClose} aria-label="Close Inspector">
              <X size={15} />
            </button>
          </div>

          <div className="panel-body">
            <div className="panel-meta-grid">
              <div className="meta-cell">
                <span className="meta-lbl">ROLE</span>
                <span className="meta-val">{cluster.role}</span>
              </div>
              <div className="meta-cell">
                <span className="meta-lbl">FILES</span>
                <span className="meta-val">{cluster.files}</span>
              </div>
              <div className="meta-cell">
                <span className="meta-lbl">LINES</span>
                <span className="meta-val">{cluster.lines.toLocaleString()}</span>
              </div>
              <div className="meta-cell">
                <span className="meta-lbl">ISSUES</span>
                <span className={`meta-val ${cluster.issues > 0 ? "warn" : ""}`}>{cluster.issues}</span>
              </div>
            </div>

            <div className="panel-section">
              <span className="section-label">INCOMING DEPENDENCIES ({incomingClusters.length})</span>
              {incomingClusters.length === 0 ? (
                <div className="empty-sub">No other internal modules depend on this.</div>
              ) : (
                <div className="cluster-tags">
                  {incomingClusters.map((c) => (
                    <button key={c} className="chip" onClick={() => onFocusModule(c!)}>
                      ← {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="panel-section">
              <span className="section-label">OUTGOING DEPENDENCIES ({outgoingClusters.length})</span>
              {outgoingClusters.length === 0 ? (
                <div className="empty-sub">Does not depend on other modules (leaf layer).</div>
              ) : (
                <div className="cluster-tags">
                  {outgoingClusters.map((c) => (
                    <button key={c} className="chip" onClick={() => onFocusModule(c!)}>
                      → {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="panel-section">
              <span className="section-label">CONTAINED FILES ({moduleFiles.length})</span>
              <div className="module-file-scroll">
                {moduleFiles.map((f) => (
                  <button key={f.path} className="file-list-item" onClick={() => onOpenFile(f.path)}>
                    <span className="file-name">{f.name}</span>
                    <span className="file-loc">{f.loc} LOC</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel-actions">
              <button
                className="btn ghost full-width"
                onClick={() => onAskAbout(`Explain the role and architecture of module "${cluster.name}" in this repository.`)}
              >
                Explain Module with AI
              </button>
            </div>
          </div>
        </aside>
      );
    }
  }

  // 3. Selected File View
  if (selectedFilePath) {
    const node = analysis.nodes.find((n) => n.path === selectedFilePath);
    if (node) {
      return (
        <aside className="contextual-panel" aria-label="File Inspector">
          <div className="panel-header">
            <div>
              <span className="panel-eyebrow">FILE INSPECTOR</span>
              <h3 className="file-header-title">{node.name}</h3>
            </div>
            <button className="panel-close-btn" onClick={onClose} aria-label="Close Inspector">
              <X size={15} />
            </button>
          </div>

          <div className="panel-body">
            <div className="file-path-badge">
              <code>{node.path}</code>
            </div>

            <div className="panel-meta-grid">
              <div className="meta-cell">
                <span className="meta-lbl">LANGUAGE</span>
                <span className="meta-val">{node.language}</span>
              </div>
              <div className="meta-cell">
                <span className="meta-lbl">LOC</span>
                <span className="meta-val">{node.loc}</span>
              </div>
              <div className="meta-cell">
                <span className="meta-lbl">FAN-IN (CALLERS)</span>
                <span className="meta-val">{node.fanIn}</span>
              </div>
              <div className="meta-cell">
                <span className="meta-lbl">FAN-OUT (DEPS)</span>
                <span className="meta-val">{node.fanOut}</span>
              </div>
            </div>

            <div className="panel-section">
              <span className="section-label">EXPORTS ({node.exports.length})</span>
              {node.exports.length === 0 ? (
                <div className="empty-sub">No exported symbols found.</div>
              ) : (
                <div className="export-chips">
                  {node.exports.map((exp) => (
                    <span
                      key={exp.name}
                      className={`chip mono-chip ${node.deadExports.includes(exp.name) ? "dead-exp" : ""}`}
                      title={node.deadExports.includes(exp.name) ? "Unused export" : exp.kind}
                    >
                      {exp.name}
                      {node.deadExports.includes(exp.name) && " (unused)"}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {node.externalImports.length > 0 && (
              <div className="panel-section">
                <span className="section-label">EXTERNAL PACKAGES ({node.externalImports.length})</span>
                <div className="export-chips">
                  {node.externalImports.map((pkg) => (
                    <span key={pkg} className="chip mono-chip pkg-chip">
                      {pkg}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="panel-actions">
              <button className="btn primary full-width" onClick={() => onOpenFile(node.path)}>
                Open in Code Explorer
              </button>
              <button
                className="btn ghost full-width"
                onClick={() => onAskAbout(`Explain the implementation and purpose of ${node.path}`)}
              >
                Explain Code with AI
              </button>
            </div>
          </div>
        </aside>
      );
    }
  }

  // 4. Default: Repository Overview Summary Drawer
  return (
    <aside className="contextual-panel" aria-label="Repository Inspector">
      <div className="panel-header">
        <div>
          <span className="panel-eyebrow">REPOSITORY INTELLIGENCE</span>
          <h3>{analysis.repo.name}</h3>
        </div>
        <button className="panel-close-btn" onClick={onClose} aria-label="Close Inspector">
          <X size={15} />
        </button>
      </div>

      <div className="panel-body">
        <div className="repo-health-card">
          <div className="health-badge-row">
            <span className="health-score">
              {analysis.issues.filter((i) => i.severity === "critical").length === 0 ? "96" : "82"}
            </span>
            <div className="health-desc">
              <strong>Architecture Health</strong>
              <span>
                {analysis.issues.filter((i) => i.severity === "critical").length === 0
                  ? "Clean boundary separation"
                  : `${analysis.issues.filter((i) => i.severity === "critical").length} critical findings`}
              </span>
            </div>
          </div>
        </div>

        <div className="panel-section">
          <span className="section-label">SUMMARY METRICS</span>
          <div className="panel-meta-grid">
            <div className="meta-cell">
              <span className="meta-lbl">FILES</span>
              <span className="meta-val">{analysis.stats.files}</span>
            </div>
            <div className="meta-cell">
              <span className="meta-lbl">TOTAL LOC</span>
              <span className="meta-val">{analysis.stats.lines.toLocaleString()}</span>
            </div>
            <div className="meta-cell">
              <span className="meta-lbl">MODULES</span>
              <span className="meta-val">{analysis.stats.clusters}</span>
            </div>
            <div className="meta-cell">
              <span className="meta-lbl">DEPENDENCIES</span>
              <span className="meta-val">{analysis.stats.internalDeps}</span>
            </div>
          </div>
        </div>

        <div className="panel-section">
          <span className="section-label">TOP MODULES</span>
          <div className="module-file-scroll">
            {analysis.clusters.map((c) => (
              <button key={c.id} className="file-list-item" onClick={() => onFocusModule(c.id)}>
                <span className="file-name">{c.name}</span>
                <span className="file-loc">{plural(c.files, "file")} · {c.role}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel-actions">
          <button
            className="btn ghost full-width"
            onClick={() => onAskAbout("Explain the high-level architecture of this entire repository")}
          >
            Ask AI Architecture Overview
          </button>
        </div>
      </div>
    </aside>
  );
}
