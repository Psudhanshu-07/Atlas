import type { ReactNode } from "react";
import type { Severity } from "../../shared/types";
import { AlertTriangle, X } from "lucide-react";
import logoSrc from "../assets/logo.png";

export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`spinner ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** The CodeAtlas brand mark. */
export function Logo({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      className={`atlas-brand-logo ${className}`}
      src={logoSrc}
      alt="CodeAtlas"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

/** GitHub's mark. Not in the icon set we ship, so the path lives here once. */
export function GithubMark({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const label = severity === "critical" ? "Critical" : severity === "warning" ? "Warning" : "Info";
  return <span className={`badge sev-${severity}`}>{label}</span>;
}

export function Badge({
  variant = "default",
  children,
  className = "",
}: {
  variant?: "default" | "accent" | "success" | "warning" | "danger" | "muted";
  children: ReactNode;
  className?: string;
}) {
  return <span className={`badge badge-${variant} ${className}`}>{children}</span>;
}

export function StatusDot({ status }: { status: "online" | "warning" | "error" | "analyzing" | "idle" }) {
  return <span className={`status-dot status-${status}`} />;
}

export function Stat({
  label,
  value,
  hint,
  trend,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="stat" title={hint}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <div className="stat-value">{value}</div>
      {(hint || trend) && (
        <div className="stat-hint">
          {trend && <span className="stat-trend">{trend}</span>}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </div>
  );
}

export function MetricDisplay({
  title,
  value,
  subvalue,
  badge,
}: {
  title: string;
  value: ReactNode;
  subvalue?: string;
  badge?: ReactNode;
}) {
  return (
    <div className="metric-display">
      <div className="metric-header">
        <span className="metric-title">{title}</span>
        {badge}
      </div>
      <div className="metric-main">{value}</div>
      {subvalue && <div className="metric-sub">{subvalue}</div>}
    </div>
  );
}

export function Section({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section ${className}`}>
      <header className="section-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="section-sub">{subtitle}</p>}
        </div>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function LoadingSkeleton({ lines = 3, height = 18 }: { lines?: number; height?: number }) {
  return (
    <div className="skeleton-wrap" role="status" aria-label="Loading...">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton-bar"
          style={{
            height: `${height}px`,
            width: i === lines - 1 && lines > 1 ? "60%" : "100%",
            marginBottom: "8px",
          }}
        />
      ))}
    </div>
  );
}

export function NeedRepoState({ onConnect }: { onConnect: () => void }) {
  return (
    <EmptyState
      title="Connect a repository first"
      description="Atlas maps architecture, dependencies and plain-English explanations from a real GitHub URL or local checkout. Import a repo to unlock this view."
      action={
        <button className="btn primary" onClick={onConnect}>
          Connect a repository
        </button>
      }
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-state-icon">{icon}</div> : <div className="empty-state-circle">∅</div>}
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "An error occurred",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <div className="error-icon" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <AlertTriangle size={18} />
      </div>
      <div className="error-body">
        <h4>{title}</h4>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button className="btn ghost" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${confirmVariant === "danger" ? "danger" : "primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
  onClear,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  onClear?: () => void;
}) {
  return (
    <div className={`search-input-wrap ${className}`}>
      <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
      {value && (
        <button
          className="search-clear-btn"
          onClick={() => {
            onChange("");
            onClear?.();
          }}
          title="Clear search"
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function shortPath(p: string): string {
  const parts = p.split("/");
  if (parts.length <= 3) return p;
  return `${parts[0]}/…/${parts[parts.length - 1]}`;
}
