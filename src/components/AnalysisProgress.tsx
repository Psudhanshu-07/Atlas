import { Check, Loader2, AlertTriangle } from "lucide-react";
import type { Job } from "../api";

interface Props {
  job: Job;
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="progress-counter">
      <span className="progress-counter-value">{value.toLocaleString()}</span>
      <span className="progress-counter-label">{label}</span>
    </div>
  );
}

/**
 * Shown while an analysis runs. Deliberately a centred overlay with a backdrop
 * rather than a bar pinned to the viewport edge, so it never covers
 * content the user is trying to read.
 */
export function AnalysisProgress({ job }: Props) {
  const pct = Math.max(2, Math.round(job.progress * 100));
  const stages = job.stages;
  const counters = job.counters;

  return (
    <div className="progress-overlay" role="status" aria-live="polite">
      <div className="progress-card">
        <div className="progress-head">
          <div className="progress-title-row">
            <span className="progress-orb" aria-hidden />
            <div className="progress-title-text">
              <h2 className="progress-title">Mapping your codebase</h2>
              <p className="progress-source" title={job.source}>
                {job.source}
              </p>
            </div>
          </div>
          <div className="progress-percent">{pct}%</div>
        </div>

        <div className="progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <p className="progress-message">{job.message}</p>

        <ol className="progress-stages">
          {stages.map((s) => (
            <li key={s.id} className={`progress-stage is-${s.state}`}>
              <span className="progress-stage-icon" aria-hidden>
                {s.state === "done" ? (
                  <Check size={13} strokeWidth={3} />
                ) : s.state === "active" ? (
                  <Loader2 size={13} className="spin" />
                ) : (
                  <span className="progress-stage-pending" />
                )}
              </span>
              <span className="progress-stage-label">{s.label}</span>
              {s.detail && <span className="progress-stage-detail">{s.detail}</span>}
            </li>
          ))}
        </ol>

        {counters.files > 0 && (
          <div className="progress-counters">
            <Count label="files" value={counters.files} />
            <Count label="lines" value={counters.loc} />
            <Count label="modules" value={counters.modules} />
            <Count label="links" value={counters.deps} />
          </div>
        )}

        <p className="progress-hint">
          <AlertTriangle size={12} />
          You can keep reading the current repository; the new one opens when the run finishes.
        </p>
      </div>
    </div>
  );
}