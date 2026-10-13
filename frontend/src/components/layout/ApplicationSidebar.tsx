import { useEffect, useRef, useState, type ComponentType } from "react";
import type { Analysis, AnalysisSummary, SessionUser } from "../../../../shared/types";
import { plural } from "../../../../shared/format";
import type { ViewId } from "../../state/useWorkspace";
import { VIEWS_NEEDING_REPO } from "../../state/useWorkspace";
import {
  AlertTriangle,
  Boxes,
  Check,
  Clock,
  FileText,
  FolderGit2,
  HelpCircle,
  Keyboard,
  LayoutGrid,
  LogOut,
  Moon,
  Network,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  ChevronsUpDown,
} from "lucide-react";

interface Props {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  analysis: Analysis | null;
  recent: AnalysisSummary[];
  user: SessionUser | null;
  onSelectRepo: (id: string) => void;
  onNewRepo: () => void;
  aiEnabled: boolean;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onSignOut: () => void;
  onOpenShortcuts: () => void;
  onOpenCommandPalette: () => void;
  mobileNavOpen?: boolean;
}

/** First letters of up to two words, used as the fallback avatar. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

interface NavEntry {
  id: ViewId;
  label: string;
  iconName: string;
  iconFallback: ComponentType<{ size?: number; className?: string }>;
  isSpecial?: boolean;
}

interface NavSection {
  title: string;
  items: NavEntry[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Explore",
    items: [
      { id: "overview", label: "Overview", iconName: "dashboard", iconFallback: LayoutGrid },
      { id: "architecture", label: "Architecture", iconName: "account_tree", iconFallback: Boxes },
      { id: "dependencies", label: "Dependencies", iconName: "hub", iconFallback: Network },
      { id: "explorer", label: "Code", iconName: "code", iconFallback: Search },
      { id: "assistant", label: "Ask Atlas", iconName: "auto_awesome", iconFallback: Sparkles, isSpecial: true },
    ],
  },
  {
    title: "Review",
    items: [
      { id: "insights", label: "Findings", iconName: "rule", iconFallback: AlertTriangle },
      { id: "docs", label: "Docs", iconName: "description", iconFallback: FileText },
    ],
  },
  {
    title: "Workspace",
    items: [
      { id: "repositories", label: "Connect", iconName: "folder_data", iconFallback: FolderGit2 },
      { id: "history", label: "History", iconName: "history", iconFallback: Clock },
      { id: "settings", label: "Settings", iconName: "tune", iconFallback: Settings },
    ],
  },
];

export function ApplicationSidebar({
  view,
  onNavigate,
  analysis,
  recent,
  user,
  onSelectRepo,
  onNewRepo,
  aiEnabled,
  theme,
  onToggleTheme,
  onSignOut,
  onOpenShortcuts,
  onOpenCommandPalette,
  mobileNavOpen,
}: Props) {
  const [repoMenuOpen, setRepoMenuOpen] = useState(false);
  const repoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (repoRef.current && !repoRef.current.contains(e.target as Node)) setRepoMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const findingCount = analysis ? analysis.issues.filter((i) => i.severity !== "info").length : 0;

  const countFor = (id: ViewId): number | undefined => {
    if (id === "insights") return findingCount || undefined;
    if (id === "docs") return analysis?.docs.length || undefined;
    if (id === "repositories") return recent.length || undefined;
    return undefined;
  };

  const userName = user?.name || "Preview";
  // The role is whatever the user set in Settings; only derive a placeholder
  // when they have not defined one (admins keep a readable default).
  const userRole = user ? (user.role?.trim() || (user.isAdmin ? "Workspace admin" : null)) : null;

  return (
    <aside
      className={`fixed left-0 top-0 h-screen w-60 bg-surface-container-low border-r border-surface-variant flex flex-col z-50 select-none transition-transform duration-200 -translate-x-full md:translate-x-0 ${
        mobileNavOpen ? "!translate-x-0" : ""
      }`}
      aria-label="Main navigation"
    >
      {/* Brand & Repository Selector Top Bar */}
      <div className="p-space-md border-b border-surface-variant flex flex-col gap-space-sm">
        <div
          className="flex items-center gap-space-sm cursor-pointer"
          onClick={() => onNavigate("overview")}
          role="button"
          tabIndex={0}
        >
          <img
            src="/logo.png"
            alt="Atlas Emblem"
            className="w-6 h-6 rounded-md object-contain border border-surface-variant/40"
          />
          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">
            Atlas
          </span>
          <span className="ml-auto font-micro-label text-micro-label px-1.5 py-0.5 rounded border border-outline-variant bg-surface-container text-tertiary uppercase font-medium">
            v2.4
          </span>
        </div>

        {/* Repository selector button */}
        <div className="relative" ref={repoRef}>
          <button
            className="w-full flex items-center justify-between px-space-sm py-1.5 rounded bg-surface-container border border-surface-variant text-left hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
            type="button"
            onClick={() => setRepoMenuOpen((p) => !p)}
            aria-haspopup="listbox"
            aria-expanded={repoMenuOpen}
          >
            <div className="flex flex-col min-w-0 pr-1">
              <span className="font-micro-label text-micro-label text-on-surface-variant tracking-wider">
                REPOSITORY
              </span>
              <span className="font-code-compact text-code-compact text-on-surface truncate font-medium">
                {analysis ? analysis.repo.name : "Select repository…"}
              </span>
            </div>
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">
              unfold_more
            </span>
          </button>

          {repoMenuOpen && (
            <div
              className="absolute left-0 right-0 top-full mt-1 bg-surface-container-high border border-surface-variant rounded-md shadow-xl py-1 z-50 text-body-compact"
              role="listbox"
            >
              <div className="px-3 py-1 font-micro-label text-micro-label text-on-surface-variant tracking-wider uppercase border-b border-surface-variant/40">
                Analysed Repositories
              </div>
              <div className="max-h-56 overflow-y-auto py-0.5">
                {recent.length === 0 ? (
                  <div className="px-3 py-2 text-micro-label text-on-surface-variant italic">
                    Nothing analysed yet
                  </div>
                ) : (
                  recent.map((r) => {
                    const active = analysis?.repo.id === r.id;
                    return (
                      <button
                        key={r.id}
                        role="option"
                        aria-selected={active}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-surface-container transition-colors ${
                          active ? "bg-surface-container text-primary" : "text-on-surface"
                        }`}
                        onClick={() => {
                          onSelectRepo(r.id);
                          setRepoMenuOpen(false);
                        }}
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="font-code-compact font-medium truncate">{r.name}</span>
                          <span className="text-[10px] text-on-surface-variant font-mono">
                            {plural(r.files, "file")} · {plural(r.issues, "finding")}
                          </span>
                        </div>
                        {active && <Check size={14} className="text-tertiary shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="border-t border-surface-variant/40 pt-1 mt-1">
                <button
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-primary hover:bg-surface-container transition-colors font-medium text-[12px]"
                  onClick={() => {
                    setRepoMenuOpen(false);
                    onNewRepo();
                  }}
                >
                  <Plus size={14} />
                  <span>Connect a repository</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Links Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-space-xs py-space-sm space-y-space-md">
        {NAV_SECTIONS.map((section) => (
          <nav key={section.title} className="flex flex-col gap-0.5">
            <div className="px-space-sm pt-space-xs pb-1 font-micro-label text-micro-label text-on-surface-variant tracking-widest uppercase">
              {section.title}
            </div>
            {section.items.map((item) => {
              const active = view === item.id;
              const disabled = VIEWS_NEEDING_REPO.has(item.id) && !analysis;
              const count = countFor(item.id);

              return (
                <button
                  key={item.id}
                  disabled={disabled}
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? "page" : undefined}
                  title={disabled ? "Connect a repository first" : item.label}
                  className={`flex items-center justify-between px-space-sm py-1.5 rounded font-body-compact text-body-compact transition-colors text-left w-full cursor-pointer ${
                    active
                      ? "bg-surface-container-high text-on-surface border-l-2 border-primary font-medium"
                      : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                  } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center gap-space-sm min-w-0">
                    <span
                      className={`material-symbols-outlined text-[18px] shrink-0 ${
                        item.isSpecial ? "text-tertiary" : ""
                      }`}
                    >
                      {item.iconName}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </div>

                  {count !== undefined && (
                    <span
                      className={`font-micro-label text-micro-label px-1.5 py-0.2 rounded shrink-0 ${
                        item.id === "insights"
                          ? "border border-error-container bg-error-container/20 text-error font-semibold"
                          : "border border-surface-variant bg-surface-container text-on-surface-variant"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        ))}
      </div>

      {/* Sidebar Bottom Footer: Telemetry & User Account */}
      <div className="border-t border-surface-variant p-space-xs bg-surface-container-lowest">
        {/* Status bar row */}
        <div className="flex items-center justify-between px-space-sm py-1 text-on-surface-variant font-micro-label text-micro-label border-b border-surface-variant/40 mb-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                aiEnabled ? "bg-tertiary animate-pulse" : "bg-on-surface-variant"
              }`}
            />
            <span className={aiEnabled ? "text-tertiary font-medium" : "text-on-surface-variant"}>
              {aiEnabled ? "AI on" : "Heuristic"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              className="px-1 py-0.5 rounded border border-surface-variant bg-surface-container text-on-surface-variant text-[10px] hover:text-on-surface transition-colors"
              onClick={onOpenCommandPalette}
              title="Command palette (⌘K)"
            >
              ⌘K
            </button>
            <button
              className="hover:text-on-surface transition-colors p-0.5"
              onClick={onToggleTheme}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {theme === "dark" ? "light_mode" : "dark_mode"}
              </span>
            </button>
            <button
              className="hover:text-on-surface transition-colors p-0.5"
              onClick={onOpenShortcuts}
              title="Keyboard shortcuts (?)"
            >
              <span className="material-symbols-outlined text-[14px]">help</span>
            </button>
          </div>
        </div>

        {/* User profile row */}
        <div className="flex items-center justify-between p-space-xs rounded bg-surface-container hover:bg-surface-container-high transition-colors">
          <div
            className="flex items-center gap-space-sm min-w-0 cursor-pointer"
            onClick={() => onNavigate("settings")}
            title="Open settings"
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={userName}
                className="w-6 h-6 rounded-full object-cover border border-surface-variant flex-shrink-0"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-mono-metric text-micro-label font-bold flex-shrink-0">
                {initials(userName) || "CA"}
              </div>
            )}
            <div className="flex flex-col min-w-0 leading-tight">
              <span className="font-body-compact text-body-compact text-on-surface truncate font-medium">
                {userName}
              </span>
              {userRole && (
                <span className="font-micro-label text-micro-label text-on-surface-variant truncate">
                  {userRole}
                </span>
              )}
            </div>
          </div>

          <button
            className="p-1 text-on-surface-variant hover:text-error transition-colors flex-shrink-0 cursor-pointer"
            title="Sign out"
            type="button"
            onClick={onSignOut}
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}