import { useMemo } from "react";
import type { Analysis, DashboardData, SessionUser } from "../../../../shared/types";
import { buildRepoUnderstanding } from "../../../../shared/understand";

interface Props {
  analysis: Analysis | null;
  user: SessionUser | null;
  dashboard: DashboardData | null;
  onOpenFile: (path: string) => void;
  onOpenRecent: (id: string) => void;
  onFocusModule: (cluster: string) => void;
  onAskAbout: (prompt: string) => void;
  onAddRepo: () => void;
  onOpenRepos: () => void;
  onOpenArchitecture: () => void;
  onOpenDependencies: () => void;
  onOpenInsights: () => void;
  onOpenDocs: () => void;
}

/** First word of the display name, used in the greeting. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

const LAYER_COLORS = [
  "bg-secondary",
  "bg-tertiary",
  "bg-secondary-container",
  "bg-primary",
  "bg-surface-variant",
  "bg-primary-container",
];

const ENTRY_ICONS = ["code", "route", "security", "database"];
const ENTRY_COLORS = ["text-tertiary", "text-secondary", "text-primary", "text-on-surface-variant"];

export function OverviewDashboard({
  analysis,
  user,
  dashboard,
  onOpenFile,
  onFocusModule,
  onAskAbout,
  onAddRepo,
  onOpenDependencies,
  onOpenInsights,
}: Props) {
  const understanding = useMemo(
    () => (analysis ? buildRepoUnderstanding(analysis) : null),
    [analysis],
  );

  const ws = dashboard?.stats;
  const userName = user ? firstName(user.name) : "there";

  if (!analysis || !understanding) {
    return (
      <div className="flex flex-col w-full">
        {/* Top Telemetry & Control Bar */}
        <div className="w-full bg-surface-container-low px-space-lg py-space-sm flex items-center justify-between border-b border-surface-variant/40">
          <div className="flex items-center gap-space-md min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-tertiary"></span>
              <span className="font-body-bold text-body-bold text-on-surface tracking-tight">
                Welcome back, {userName}
              </span>
            </div>
            <div className="h-3 w-px bg-surface-variant"></div>
            <div className="flex items-center gap-2 font-micro-label text-micro-label text-on-surface-variant">
              <span className="text-on-surface">{ws?.repositories ?? 0}</span> repo
              <span className="text-surface-variant">·</span>
              <span className="text-on-surface">{ws?.analyses ?? 0}</span> analysis
              <span className="text-surface-variant">·</span>
              <span className="text-on-surface">{ws?.files ?? 0}</span> files
              <span className="text-surface-variant">·</span>
              <span className="text-error font-medium">{ws?.findings ?? 0} findings</span>
            </div>
          </div>
          <div className="flex items-center gap-space-sm">
            <button
              className="h-7 px-3 rounded flex items-center gap-1.5 bg-primary-container hover:bg-primary-container/90 text-on-primary-container text-body-compact font-body-bold transition-colors cursor-pointer"
              type="button"
              onClick={onAddRepo}
            >
              <span className="material-symbols-outlined text-[15px] font-bold">add</span>
              <span>Connect repository</span>
            </button>
          </div>
        </div>

        {/* Empty State */}
        <div className="p-space-lg max-w-4xl mx-auto w-full my-12">
          <div className="bg-surface-container-low border border-surface-variant rounded-lg p-8 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary border border-surface-variant">
              <span className="material-symbols-outlined text-[24px]">folder_data</span>
            </div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface font-semibold">
              No repositories connected
            </h2>
            <p className="font-body-default text-body-default text-on-surface-variant max-w-md">
              Connect a Git repository or a local path to map every file, resolve the import graph,
              and surface the structural issues hiding inside it.
            </p>
            <button
              className="h-8 px-4 rounded flex items-center gap-2 bg-primary-container hover:bg-primary-container/90 text-on-primary-container font-body-bold text-body-compact transition-colors cursor-pointer"
              onClick={onAddRepo}
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Connect repository</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { stats, issues, layers, clusters, languages } = analysis;
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const topFindings = issues.slice(0, 5);

  // Reading order comes from the real analysis, highest information gain first.
  const entryFiles = understanding.beginnerFiles.slice(0, 4);

  // Coupling comes from real in/out module edges only; clusters with no edges
  // are simply not part of the "most coupled" list.
  const coupledModules = useMemo(() => {
    const list = clusters.map((c) => ({
      id: c.id,
      name: c.name || c.id,
      links: (c.outbound || 0) + (c.inbound || 0),
    }));
    return list
      .filter((m) => m.links > 0)
      .sort((a, b) => b.links - a.links)
      .slice(0, 3);
  }, [clusters]);

  const totalLoc = languages.reduce((s, l) => s + l.lines, 0) || stats.lines || 1;

  const primaryLang = languages[0]?.name || "TS";
  const langSub =
    languages.length > 1
      ? `${primaryLang.slice(0, 2).toUpperCase()}/${languages[1]?.name.slice(0, 2).toUpperCase()}`
      : primaryLang.slice(0, 2).toUpperCase();

  // Architecture health score (100 minus penalties based on real findings)
  const healthScore = Math.max(
    12,
    Math.min(96, Math.round(100 - criticalCount * 18 - issues.length * 2.5)),
  );
  const healthLabel =
    healthScore < 50 ? "Severely degraded" : healthScore < 75 ? "Needs optimization" : "Architecturally sound";
  const healthColor =
    healthScore < 50 ? "text-error" : healthScore < 75 ? "text-warning" : "text-tertiary";

  return (
    <div className="flex flex-col w-full">
      {/* Top Telemetry & Control Bar */}
      <div className="w-full bg-surface-container-low px-space-lg py-space-sm flex items-center justify-between border-b border-surface-variant/40">
        <div className="flex items-center gap-space-md min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-tertiary"></span>
            <span className="font-body-bold text-body-bold text-on-surface tracking-tight">
              Welcome back, {userName}
            </span>
          </div>
          <div className="h-3 w-px bg-surface-variant"></div>
          <div className="flex items-center gap-2 font-micro-label text-micro-label text-on-surface-variant">
            <span className="text-on-surface">{ws?.repositories ?? 1}</span> repo
            <span className="text-surface-variant">·</span>
            <span className="text-on-surface">{ws?.analyses ?? 1}</span> analysis
            <span className="text-surface-variant">·</span>
            <span className="text-on-surface">{stats.files}</span> files
            <span className="text-surface-variant">·</span>
            <span className="text-error font-medium">{stats.issues} findings</span>
          </div>
        </div>
        <div className="flex items-center gap-space-sm">
          <button
            className="h-7 px-3 rounded flex items-center gap-1.5 bg-primary-container hover:bg-primary-container/90 text-on-primary-container text-body-compact font-body-bold transition-colors cursor-pointer"
            type="button"
            onClick={onAddRepo}
          >
            <span className="material-symbols-outlined text-[15px] font-bold">add</span>
            <span>Connect repository</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Workspace */}
      <div className="p-space-lg flex flex-col gap-space-lg w-full max-w-[1680px] mx-auto">
        {/* Synthesis Card */}
        <div className="bg-surface-container-low rounded-lg p-space-md relative overflow-hidden border border-surface-variant/40">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-surface-variant/30">
            <div className="flex items-center gap-2">
              <span className="font-micro-label text-micro-label text-tertiary tracking-wider uppercase font-semibold">
                SYSTEM SYNTHESIS
              </span>
              <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-micro-label text-[10px]">
                AST PASS COMPLETE
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-micro-label text-micro-label text-on-surface-variant">
              <span className="material-symbols-outlined text-[14px] text-tertiary">verified</span>
              <span>deterministic sync</span>
            </div>
          </div>
          <p className="font-body-default text-body-default text-on-surface leading-relaxed max-w-5xl">
            <span className="font-code-default text-code-default text-secondary font-semibold">
              {analysis.repo.name}
            </span>{" "}
            is a layered architecture with{" "}
            <span className="font-mono-metric text-on-surface font-semibold">{stats.files}</span>{" "}
            source files and{" "}
            <span className="font-mono-metric text-on-surface font-semibold">
              {stats.lines.toLocaleString()}
            </span>{" "}
            lines across{" "}
            <span className="font-mono-metric text-on-surface font-semibold">{stats.clusters}</span>{" "}
            modules, with{" "}
            <span className="font-mono-metric text-on-surface font-semibold">
              {stats.internalDeps.toLocaleString()}
            </span>{" "}
            internal dependencies.
          </p>
        </div>

        {/* Metrics Row (6 high-density cards) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-space-sm">
          <div className="bg-surface-container-low p-space-sm rounded flex flex-col justify-between border border-surface-variant/40">
            <span className="font-micro-label text-micro-label text-on-surface-variant uppercase tracking-wider">
              FILES
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="font-mono-metric text-headline-xl text-on-surface">{stats.files}</span>
              <span className="font-code-compact text-code-compact text-tertiary font-bold">
                {langSub}
              </span>
            </div>
          </div>

          <div className="bg-surface-container-low p-space-sm rounded flex flex-col justify-between border border-surface-variant/40">
            <span className="font-micro-label text-micro-label text-on-surface-variant uppercase tracking-wider">
              LINES OF CODE
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="font-mono-metric text-headline-xl text-on-surface">
                {stats.lines.toLocaleString()}
              </span>
              <span className="font-code-compact text-code-compact text-on-surface-variant font-mono">
                LOC
              </span>
            </div>
          </div>

          <div className="bg-surface-container-low p-space-sm rounded flex flex-col justify-between border border-surface-variant/40">
            <span className="font-micro-label text-micro-label text-on-surface-variant uppercase tracking-wider">
              MODULES
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="font-mono-metric text-headline-xl text-on-surface">{stats.clusters}</span>
              <span className="font-code-compact text-code-compact text-on-surface-variant">packages</span>
            </div>
          </div>

          <div className="bg-surface-container-low p-space-sm rounded flex flex-col justify-between border border-surface-variant/40">
            <span className="font-micro-label text-micro-label text-on-surface-variant uppercase tracking-wider">
              DEPENDENCIES
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="font-mono-metric text-headline-xl text-on-surface">
                {stats.internalDeps.toLocaleString()}
              </span>
              <span className="font-code-compact text-code-compact text-on-surface-variant">internal</span>
            </div>
          </div>

          <div className="bg-surface-container-low p-space-sm rounded flex flex-col justify-between border border-surface-variant/40">
            <span className="font-micro-label text-micro-label text-on-surface-variant uppercase tracking-wider">
              FINDINGS
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="font-mono-metric text-headline-xl text-error font-bold">{stats.issues}</span>
              <span className="font-micro-label text-micro-label px-1.5 py-0.5 rounded bg-error-container/30 text-error font-medium">
                {criticalCount} critical
              </span>
            </div>
          </div>

          <div className="bg-surface-container-low p-space-sm rounded flex flex-col justify-between relative group cursor-help border border-surface-variant/40">
            <div className="flex items-center justify-between">
              <span className="font-micro-label text-micro-label text-on-surface-variant uppercase tracking-wider">
                COVERAGE
              </span>
              <span className="material-symbols-outlined text-[13px] text-on-surface-variant group-hover:text-on-surface">
                info
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="font-mono-metric text-headline-xl text-on-surface-variant/40">—</span>
              <span className="font-code-compact text-code-compact text-on-surface-variant/50">UNLINKED</span>
            </div>
            <div className="hidden group-hover:flex absolute -top-8 left-0 right-0 bg-surface-container-highest px-2 py-1 rounded text-micro-label font-micro-label text-on-surface z-20 justify-center shadow-lg border border-surface-variant">
              No test harness reported
            </div>
          </div>
        </div>

        {/* Dual Layout: Deep Telemetry (7/12) & Operational Risks (5/12) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          {/* Left Column (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-space-lg">
            {/* Foundational Reading Order */}
            {entryFiles.length > 0 && (
              <div className="bg-surface-container-low rounded-lg p-space-md border border-surface-variant/40">
                <div className="flex items-center justify-between mb-space-sm pb-2 border-b border-surface-variant/40">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[17px] text-secondary">explore</span>
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                      Where to Start Reading
                    </span>
                  </div>
                  <span className="font-micro-label text-micro-label text-on-surface-variant tracking-wider uppercase">
                    Critical entry pathways
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  {entryFiles.map((f, idx) => (
                    <div
                      key={f.path}
                      className="flex items-center justify-between p-2 rounded bg-surface-container/60 hover:bg-surface-container transition-colors border border-surface-variant/30"
                    >
                      <div className="flex items-center gap-space-sm min-w-0 pr-2">
                        <span className={`material-symbols-outlined text-[16px] ${ENTRY_COLORS[idx % ENTRY_COLORS.length]}`}>
                          {ENTRY_ICONS[idx % ENTRY_ICONS.length]}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="font-code-default text-code-default text-secondary truncate font-medium">
                            {f.path}
                          </span>
                          <span className="font-body-compact text-body-compact text-on-surface-variant truncate">
                            {f.reason}
                          </span>
                        </div>
                      </div>
                      <button
                        className="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface text-body-compact font-code-compact flex items-center gap-1 transition-colors flex-shrink-0 cursor-pointer"
                        type="button"
                        onClick={() => onOpenFile(f.path)}
                      >
                        <span>Open</span>
                        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Architecture Layers & Composition */}
            <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col gap-space-md border border-surface-variant/40">
              <div className="flex items-center justify-between pb-2 border-b border-surface-variant/40">
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Architecture Layers &amp; Composition
                </span>
                <span className="font-micro-label text-micro-label text-on-surface-variant uppercase">
                  {stats.files} total components
                </span>
              </div>

              {/* Layer Stacked Bar Visual */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-micro-label font-micro-label text-on-surface-variant">
                  <span>LAYER DISTRIBUTION</span>
                  <span>
                    {layers.length} LAYERS · {clusters.length} MODULES
                  </span>
                </div>
                <div className="w-full h-4 rounded overflow-hidden flex bg-surface-container border border-surface-variant/40">
                  {layers.map((l, i) => {
                    const pct = Math.max(2, Math.round((l.files / (stats.files || 1)) * 100));
                    return (
                      <div
                        key={l.id}
                        className={`${LAYER_COLORS[i % LAYER_COLORS.length]} h-full transition-all`}
                        style={{ width: `${pct}%` }}
                        title={`${l.name} (${l.files})`}
                      />
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-1 font-micro-label text-micro-label text-on-surface-variant">
                  {layers.map((l, i) => (
                    <div key={l.id} className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${LAYER_COLORS[i % LAYER_COLORS.length]}`} />
                      <span>
                        {l.name} ({l.files})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Language Breakdown */}
              <div className="pt-3 border-t border-surface-variant/30 flex flex-col gap-2">
                <div className="flex items-center justify-between text-micro-label font-micro-label text-on-surface-variant">
                  <span>LANGUAGE COMPOSITION</span>
                  <span className="font-mono-metric text-on-surface">{stats.lines.toLocaleString()} LOC</span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden flex bg-surface-container">
                  {languages.map((l) => {
                    const pct = Math.max(1, Math.round((l.lines / totalLoc) * 100));
                    return (
                      <div
                        key={l.name}
                        className="h-full"
                        style={{ width: `${pct}%`, backgroundColor: l.color || "#acc7ff" }}
                        title={`${l.name} ${pct}%`}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 text-micro-label font-micro-label flex-wrap">
                  {languages.slice(0, 5).map((l) => (
                    <span key={l.name} className="flex items-center gap-1 text-on-surface">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: l.color || "#acc7ff" }}
                      />
                      {l.name} {Math.round((l.lines / totalLoc) * 100)}%
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-space-lg">
            {/* What to Watch / High-Priority Findings */}
            <div className="bg-surface-container-low rounded-lg p-space-md border border-surface-variant/40">
              <div className="flex items-center justify-between mb-space-sm pb-2 border-b border-surface-variant/40">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[17px] text-error">warning</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                    What to Watch
                  </span>
                </div>
                <button
                  className="font-micro-label text-micro-label text-secondary hover:underline cursor-pointer"
                  onClick={onOpenInsights}
                >
                  VIEW ALL {issues.length} →
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {topFindings.length === 0 ? (
                  <div className="p-4 text-center font-micro-label text-micro-label text-tertiary uppercase tracking-wider">
                    Clean architecture: zero structural issues detected
                  </div>
                ) : (
                  topFindings.map((finding) => {
                    const isCrit = finding.severity === "critical";
                    const isWarn = finding.severity === "warning";
                    const borderCls = isCrit
                      ? "border-primary-container"
                      : isWarn
                        ? "border-tertiary"
                        : "border-surface-variant";
                    const badgeCls = isCrit
                      ? "bg-error-container/30 text-error"
                      : isWarn
                        ? "bg-tertiary-container/20 text-tertiary"
                        : "bg-surface-variant text-on-surface-variant";

                    return (
                      <div
                        key={finding.id}
                        onClick={onOpenInsights}
                        className={`p-2.5 rounded bg-surface-container/60 hover:bg-surface-container transition-colors flex flex-col gap-1 border-l-2 ${borderCls} cursor-pointer`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`px-1.5 py-0.2 rounded font-micro-label text-micro-label uppercase font-medium ${badgeCls}`}
                          >
                            {finding.severity}
                          </span>
                          <span className="font-code-compact text-code-compact text-on-surface-variant font-mono">
                            {finding.type}
                          </span>
                        </div>
                        <span className="font-body-compact text-body-compact text-on-surface font-medium leading-snug">
                          {finding.title}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Quick Link Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
              {/* Dependency Graph Tile */}
              <div
                className="bg-surface-container-low p-space-md rounded-lg flex flex-col justify-between hover:bg-surface-container transition-colors cursor-pointer group border border-surface-variant/40"
                onClick={onOpenDependencies}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="material-symbols-outlined text-[20px] text-secondary group-hover:scale-105 transition-transform">
                      hub
                    </span>
                    <span className="font-micro-label text-micro-label px-1.5 py-0.5 rounded bg-surface-container text-tertiary">
                      {stats.internalDeps} edges
                    </span>
                  </div>
                  <span className="font-body-bold text-body-bold text-on-surface block font-semibold">
                    Dependency Graph
                  </span>
                  <span className="font-body-compact text-body-compact text-on-surface-variant mt-1 block">
                    Full topological DAG with circular isolation filters.
                  </span>
                </div>
                {/* Mini network SVG visual */}
                <div className="mt-4 pt-2 border-t border-surface-variant/30 flex items-center justify-between text-on-surface-variant font-code-compact text-code-compact">
                  <span>View topology</span>
                  <svg className="text-tertiary" height="20" viewBox="0 0 60 20" width="60">
                    <circle cx="6" cy="10" fill="currentColor" r="3" />
                    <circle cx="30" cy="5" fill="currentColor" r="3" />
                    <circle cx="30" cy="15" fill="currentColor" r="3" />
                    <circle cx="54" cy="10" fill="currentColor" r="3" />
                    <line stroke="currentColor" strokeDasharray="2 1" strokeWidth="1" x1="6" x2="30" y1="10" y2="5" />
                    <line stroke="currentColor" strokeWidth="1" x1="6" x2="30" y1="10" y2="15" />
                    <line stroke="currentColor" strokeWidth="1" x1="30" x2="54" y1="5" y2="10" />
                    <line stroke="currentColor" strokeWidth="1" x1="30" x2="54" y1="15" y2="10" />
                  </svg>
                </div>
              </div>

              {/* Ask Atlas Tile */}
              <div
                className="bg-surface-container-low p-space-md rounded-lg flex flex-col justify-between hover:bg-surface-container transition-colors cursor-pointer group border border-surface-variant/40"
                onClick={() => onAskAbout(`How does ${analysis.repo.name} work, and what is its architecture?`)}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="material-symbols-outlined text-[20px] text-tertiary group-hover:scale-105 transition-transform">
                      auto_awesome
                    </span>
                    <span className="font-micro-label text-micro-label px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">
                      AST INDEX
                    </span>
                  </div>
                  <span className="font-body-bold text-body-bold text-on-surface block font-semibold">
                    Ask Atlas
                  </span>
                  <span className="font-body-compact text-body-compact text-on-surface-variant mt-1 block">
                    Query the AST index directly with natural language.
                  </span>
                </div>
                <div className="mt-4 pt-2 border-t border-surface-variant/30 flex items-center justify-between text-on-surface-variant font-code-compact text-code-compact">
                  <span>Start session</span>
                  <span className="material-symbols-outlined text-[16px] text-tertiary">terminal</span>
                </div>
              </div>
            </div>

            {/* Repository Intelligence Inspector Panel */}
            <div className="bg-surface-container-low rounded-lg p-space-md border border-surface-variant/40">
              <div className="flex items-center justify-between pb-2 border-b border-surface-variant/40 mb-3">
                <span className="font-micro-label text-micro-label text-on-surface uppercase tracking-wider font-semibold">
                  REPOSITORY INTELLIGENCE
                </span>
                <span className="font-code-compact text-code-compact text-on-surface-variant">REV 2.4</span>
              </div>

              <div className="flex items-center justify-between bg-surface-container p-space-sm rounded mb-3 border border-surface-variant/40">
                <div className="flex flex-col">
                  <span className="font-body-compact text-body-compact text-on-surface-variant">
                    Architecture Health
                  </span>
                  <span className={`font-micro-label text-micro-label ${healthColor} font-semibold`}>
                    {healthLabel}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`font-mono-metric text-headline-xl font-bold ${healthColor}`}>
                    {healthScore}
                  </span>
                  <span className="font-mono-metric text-headline-sm text-on-surface-variant">/100</span>
                </div>
              </div>

              {/* Top Coupled Modules List */}
              {coupledModules.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="font-micro-label text-micro-label text-on-surface-variant uppercase">
                    MOST COUPLED MODULES (AFFERENT + EFFERENT)
                  </span>
                  {coupledModules.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => onFocusModule(m.id)}
                      className="flex items-center justify-between text-code-compact font-code-compact py-1 px-1.5 rounded bg-surface-container-lowest hover:bg-surface-container transition-colors cursor-pointer border border-surface-variant/30"
                    >
                      <span className="text-secondary truncate">{m.name}</span>
                      <span className="font-mono-metric font-semibold text-error">{m.links} links</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
