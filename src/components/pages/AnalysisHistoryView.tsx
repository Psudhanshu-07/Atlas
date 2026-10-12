import type { Analysis, AnalysisSummary } from "../../../shared/types";
import { Badge, timeAgo } from "../ui";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

interface Props {
  analysis: Analysis | null;
  recent: AnalysisSummary[];
  onOpenRepo: (id: string) => void;
  onReanalyze: (id: string) => void;
  onDeleteRepo: (id: string) => void;
  onAddRepo: () => void;
}

export function AnalysisHistoryView({
  analysis,
  recent,
  onOpenRepo,
  onReanalyze,
  onDeleteRepo,
  onAddRepo,
}: Props) {
  return (
    <div className="history-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Analysis History</h1>
          <p className="page-desc">Every repository CodeAtlas has mapped, newest first.</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={onAddRepo}>
            <Plus size={14} style={{ marginRight: 5 }} />
            Connect repository
          </button>
        </div>
      </div>

      <div className="table-card">
        <table className="compact-table">
          <thead>
            <tr>
              <th>ANALYSIS ID</th>
              <th>REPOSITORY</th>
              <th>TYPE</th>
              <th>FILES</th>
              <th>LINES OF CODE</th>
              <th>ISSUES</th>
              <th>ANALYZED AT</th>
              <th className="text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-empty-cell">
                  No historical analyses cached yet.
                </td>
              </tr>
            ) : (
              recent.map((item) => {
                const isCurrent = analysis?.repo.id === item.id;
                return (
                  <tr key={item.id} className={isCurrent ? "table-row-active" : ""}>
                    <td>
                      <code className="analysis-id-code">{item.id}</code>
                    </td>
                    <td>
                      <div className="repo-col-info">
                        <strong>{item.name}</strong>
                        <span className="source-dim">{item.source}</span>
                      </div>
                    </td>
                    <td>
                      <Badge variant="muted">{item.kind.toUpperCase()}</Badge>
                    </td>
                    <td>
                      <span className="mono">{item.files}</span>
                    </td>
                    <td>
                      <span className="mono">{item.lines.toLocaleString()}</span>
                    </td>
                    <td>
                      <Badge variant={item.issues > 0 ? "warning" : "success"}>
                        {item.issues} findings
                      </Badge>
                    </td>
                    <td>
                      <span className="time-col">{timeAgo(item.analyzedAt)}</span>
                    </td>
                    <td className="text-right">
                      <div className="table-actions">
                        <button
                          className="btn ghost btn-sm"
                          onClick={() => onOpenRepo(item.id)}
                        >
                          Load
                        </button>
                        <button
                          className="btn ghost btn-sm btn-danger-hover"
                          onClick={() => onReanalyze(item.id)}
                          title="Re-run analysis"
                        >
                          <RefreshCw size={12} />
                        </button>
                        <button
                          className="btn ghost btn-sm btn-danger-hover"
                          onClick={() => onDeleteRepo(item.id)}
                          title="Delete cached analysis"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
