import type { Analysis, SessionUser } from "../../../../shared/types";

interface Props {
  title: string;
  analysis: Analysis | null;
  busy: boolean;
  canAnalyze: boolean;
  user?: SessionUser | null;
  onReanalyze: () => void;
  onOpenCommandPalette: () => void;
  isInspectorOpen: boolean;
  onToggleInspector: () => void;
  onToggleMobileNav: () => void;
}

export function WorkspaceHeader({
  title,
  analysis,
  busy,
  canAnalyze,
  user,
  onReanalyze,
  onOpenCommandPalette,
  isInspectorOpen,
  onToggleInspector,
  onToggleMobileNav,
}: Props) {
  const repoName = analysis?.repo.name || "demo-app";

  return (
    <header className="fixed top-0 left-0 md:left-60 right-0 h-12 bg-surface-container-low border-b border-surface-variant z-40 px-space-md flex items-center justify-between gap-space-md">
      {/* Mobile nav hamburger toggle (visible on small screens) */}
      <button
        className="md:hidden p-1 text-on-surface-variant hover:text-on-surface transition-colors"
        aria-label="Open navigation"
        onClick={onToggleMobileNav}
      >
        <span className="material-symbols-outlined text-[20px]">menu</span>
      </button>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-space-sm text-body-compact font-body-compact text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px]">folder</span>
        <span className="hover:text-on-surface transition-colors cursor-pointer font-code-compact">
          {repoName}
        </span>
        <span className="text-surface-variant">/</span>
        <span className="text-on-surface font-medium">{title}</span>
        {analysis?.repo.branch && (
          <span className="hidden sm:inline-flex items-center gap-1 font-micro-label text-[10px] px-1.5 py-0.2 rounded border border-surface-variant bg-surface-container text-on-surface-variant">
            <span className="material-symbols-outlined text-[12px]">alt_route</span>
            {analysis.repo.branch}
          </span>
        )}
      </div>

      {/* Center Search Input Trigger */}
      <div className="flex-1 max-w-xl mx-2">
        <div
          className="relative flex items-center w-full cursor-pointer"
          onClick={onOpenCommandPalette}
          role="button"
          tabIndex={0}
        >
          <span className="material-symbols-outlined absolute left-2.5 text-[16px] text-on-surface-variant pointer-events-none">
            search
          </span>
          <input
            className="w-full h-7 pl-8 pr-8 bg-surface-container-lowest border border-surface-variant rounded text-code-compact font-code-compact text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-secondary transition-colors cursor-pointer"
            placeholder="Search files, modules, actions… ⌘K"
            readOnly
            type="text"
          />
          <span className="absolute right-2 px-1 py-0.2 rounded text-[10px] font-mono border border-surface-variant bg-surface-container text-on-surface-variant pointer-events-none">
            ⌘K
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-space-sm">
        {canAnalyze && (
          <button
            className="h-7 px-2.5 flex items-center gap-1.5 rounded border border-surface-variant bg-transparent hover:bg-surface-container hover:text-on-surface text-body-compact font-body-compact text-on-surface transition-colors cursor-pointer"
            type="button"
            onClick={onReanalyze}
            disabled={busy}
          >
            <span
              className={`material-symbols-outlined text-[16px] text-on-surface-variant ${
                busy ? "animate-spin" : ""
              }`}
            >
              sync
            </span>
            <span className="hidden sm:inline">{busy ? "Analysing…" : "Re-analyse"}</span>
          </button>
        )}

        <button
          className={`h-7 px-2.5 flex items-center gap-1.5 rounded border border-surface-variant bg-surface-container hover:bg-surface-container-high hover:text-on-surface text-body-compact font-body-compact text-on-surface transition-colors cursor-pointer ${
            isInspectorOpen ? "border-secondary text-primary" : ""
          }`}
          type="button"
          onClick={onToggleInspector}
          title={isInspectorOpen ? "Hide inspector (⌘B)" : "Show inspector (⌘B)"}
        >
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
            dock_to_left
          </span>
          <span className="hidden sm:inline">Inspector</span>
        </button>

        <div className="h-4 w-px bg-surface-variant mx-0.5" />

        {user?.avatarUrl ? (
          <img
            alt={user.name}
            className="w-7 h-7 rounded-full object-cover border border-surface-variant"
            src={user.avatarUrl}
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-mono-metric text-[11px] font-bold border border-surface-variant">
            {user?.name ? user.name.slice(0, 2).toUpperCase() : "AP"}
          </div>
        )}
      </div>
    </header>
  );
}