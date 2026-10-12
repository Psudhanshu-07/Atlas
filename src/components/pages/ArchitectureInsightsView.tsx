import { useState, useMemo } from "react";
import type { Analysis, Issue, Severity } from "../../../shared/types";
import { Badge, SearchInput, SeverityBadge } from "../ui";
import {
  AlertTriangle,
  CheckCircle2,
  FileCode,
  Filter,
  Layers,
  Repeat,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Cpu,
} from "lucide-react";

interface Props {
  analysis: Analysis;
  onOpenFile: (path: string) => void;
  onSelectIssue: (issueId: string) => void;
  onAskAbout: (prompt: string) => void;
}

export function ArchitectureInsightsView({
  analysis,
  onOpenFile,
  onSelectIssue,
  onAskAbout,
}: Props) {
  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const issueCategories = useMemo(() => {
    const set = new Set(analysis.issues.map((i) => i.type));
    return Array.from(set);
  }, [analysis.issues]);

  const filteredIssues = useMemo(() => {
    const q = search.trim().toLowerCase();
    return analysis.issues.filter((i) => {
      if (severityFilter !== "all" && i.severity !== severityFilter) return false;
      if (categoryFilter !== "all" && i.type !== categoryFilter) return false;
      if (q && !i.title.toLowerCase().includes(q) && !i.description.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [analysis.issues, severityFilter, categoryFilter, search]);

  const criticalCount = analysis.issues.filter((i) => i.severity === "critical").length;
  const warningCount = analysis.issues.filter((i) => i.severity === "warning").length;
  const infoCount = analysis.issues.filter((i) => i.severity === "info").length;

  const circularCount = analysis.cycles.length;
  const deadExportsCount = analysis.nodes.reduce((acc, n) => acc + n.deadExports.length, 0);

  // Health Score Calculation (100 - penalties)
  const healthScore = Math.max(
    10,
    Math.min(100, 100 - criticalCount * 12 - warningCount * 4 - circularCount * 8)
  );

  const scoreGrade =
    healthScore >= 90 ? "A" : healthScore >= 80 ? "B" : healthScore >= 65 ? "C" : "D";

  const gradeColor =
    healthScore >= 90
      ? "var(--success)"
      : healthScore >= 80
      ? "var(--info)"
      : healthScore >= 65
      ? "var(--warning)"
      : "var(--danger)";

  return (
    <div className="insights-page">
      {/* Header */}
      <div className="insights-header">
        <div>
          <h1 className="insights-title">Architecture Insights & Code Health</h1>
          <p className="insights-sub">
            Static structural observations, circular dependency loops, modular boundaries and refactoring advisories.
          </p>
        </div>
      </div>

      {/* Architecture Governance Scorecard */}
      <div className="card arch-scorecard-banner" style={{ marginBottom: "20px" }}>
        <div className="scorecard-grid">
          {/* Health Score Pillar */}
          <div className="score-pillar">
            <div className="stat-head">
              <span className="grade-badge" style={{ borderColor: gradeColor, color: gradeColor }}>
                {scoreGrade}
              </span>
            </div>
            <div className="score-pill-value" style={{ color: gradeColor }}>
              <span className="score-num">{healthScore}</span>
              <span className="score-max">/100</span>
            </div>
            <span className="score-label">Architecture Health Index</span>
          </div>

          <div className="score-divider" />

          {/* Metric Stats Pillars */}
          <div className="score-stat-box">
            <div className="stat-head">
              <ShieldAlert size={16} color="var(--danger)" />
              <strong className="stat-num">{criticalCount}</strong>
            </div>
            <span className="stat-title">Critical Bottlenecks</span>
            <span className="stat-hint">Immediate refactoring advised</span>
          </div>

          <div className="score-stat-box">
            <div className="stat-head">
              <AlertTriangle size={16} color="var(--warning)" />
              <strong className="stat-num">{warningCount}</strong>
            </div>
            <span className="stat-title">Architectural Warnings</span>
            <span className="stat-hint">Smells & high coupling</span>
          </div>

          <div className="score-stat-box">
            <div className="stat-head">
              <Repeat size={16} color="var(--info)" />
              <strong className="stat-num">{circularCount}</strong>
            </div>
            <span className="stat-title">Circular Loops</span>
            <span className="stat-hint">Tight mutual imports</span>
          </div>

          <div className="score-stat-box">
            <div className="stat-head">
              <Cpu size={16} color="var(--text-muted)" />
              <strong className="stat-num">{deadExportsCount}</strong>
            </div>
            <span className="stat-title">Unused Public Exports</span>
            <span className="stat-hint">Dead code candidates</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Ribbon */}
      <div className="insights-controls-bar">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter insights by title, impacted file, or keyword..."
          className="insights-search"
        />

        <div className="filter-dropdown-wrap">
          <label className="ctrl-label">SEVERITY</label>
          <div className="severity-pill-group">
            <button
              className={`sev-btn ${severityFilter === "all" ? "active" : ""}`}
              onClick={() => setSeverityFilter("all")}
            >
              All ({analysis.issues.length})
            </button>
            <button
              className={`sev-btn ${severityFilter === "critical" ? "active critical" : ""}`}
              onClick={() => setSeverityFilter(severityFilter === "critical" ? "all" : "critical")}
            >
              <span className="dot dot-critical" />
              Critical ({criticalCount})
            </button>
            <button
              className={`sev-btn ${severityFilter === "warning" ? "active warning" : ""}`}
              onClick={() => setSeverityFilter(severityFilter === "warning" ? "all" : "warning")}
            >
              <span className="dot dot-warning" />
              Warnings ({warningCount})
            </button>
            <button
              className={`sev-btn ${severityFilter === "info" ? "active info" : ""}`}
              onClick={() => setSeverityFilter(severityFilter === "info" ? "all" : "info")}
            >
              <span className="dot dot-info" />
              Info ({infoCount})
            </button>
          </div>
        </div>

        <div className="filter-dropdown-wrap">
          <label className="ctrl-label">CATEGORY</label>
          <select
            className="ctrl-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories ({issueCategories.length})</option>
            {issueCategories.map((t) => (
              <option key={t} value={t}>
                {t.replace(/-/g, " ").toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Insights List */}
      <div className="insights-list-wrap">
        {filteredIssues.length === 0 ? (
          <div className="empty-insights-card">
            <ShieldCheck size={42} color="var(--success)" />
            <h3>No Architectural Inconsistencies Found</h3>
            <p>Codebase conforms to your defined architectural boundary criteria and design standards.</p>
          </div>
        ) : (
          filteredIssues.map((issue) => {
            const isCritical = issue.severity === "critical";
            const isWarning = issue.severity === "warning";
            const borderAccent = isCritical
              ? "var(--danger)"
              : isWarning
              ? "var(--warning)"
              : "var(--info)";

            return (
              <div
                key={issue.id}
                className="card insight-full-card"
                style={{ borderLeft: `3px solid ${borderAccent}` }}
              >
                <div className="insight-top-bar">
                  <div className="insight-badge-group">
                    <SeverityBadge severity={issue.severity} />
                    <span className="insight-type-tag">
                      {issue.type.replace(/-/g, " ").toUpperCase()}
                    </span>
                    <Badge variant="muted">Verified AST Fact</Badge>
                  </div>
                  <div className="insight-actions">
                    <button
                      className="btn ghost btn-sm"
                      onClick={() => onSelectIssue(issue.id)}
                      title="Inspect finding details"
                    >
                      Inspect Finding
                    </button>
                    <button
                      className="btn ghost btn-sm"
                      onClick={() =>
                        onAskAbout(
                          `How should we resolve this architectural issue: "${issue.title}"? Details: ${issue.description}`
                        )
                      }
                    >
                      <Sparkles size={12} style={{ marginRight: "4px" }} />
                      Ask AI Resolution
                    </button>
                  </div>
                </div>

                <h3 className="insight-heading">{issue.title}</h3>
                <p className="insight-description">{issue.description}</p>

                {/* Evidence Box */}
                {issue.evidence.length > 0 && (
                  <div className="insight-evidence-box">
                    <span className="box-title">STRUCTURAL EVIDENCE & CALL TRACE</span>
                    <ul className="evidence-trace-list">
                      {issue.evidence.map((ev, idx) => (
                        <li key={idx}>
                          <code>{ev}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Affected Files */}
                {issue.files.length > 0 && (
                  <div className="insight-files-row">
                    <span className="files-row-label">IMPACTED SOURCE FILES ({issue.files.length}):</span>
                    <div className="chips-wrap">
                      {issue.files.map((file) => (
                        <button
                          key={file}
                          className="chip file-chip"
                          onClick={() => onOpenFile(file)}
                          title="Open file in Code Explorer"
                        >
                          <FileCode size={13} style={{ marginRight: "4px" }} />
                          {file}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Remediation Guide */}
                {issue.fix && (
                  <div className="insight-fix-banner">
                    <Sparkles size={15} color="var(--info)" style={{ flexShrink: 0, marginTop: "2px" }} />
                    <div className="fix-body">
                      <strong>Recommended Engineering Resolution:</strong>
                      <p>{issue.fix}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
