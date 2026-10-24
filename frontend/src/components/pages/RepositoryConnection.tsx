import { useEffect, useState } from "react";
import type { AnalysisSummary, GithubRepo, SessionUser } from "../../../../shared/types";
import { timeAgo } from "../ui";
import { api } from "../../api";

interface Props {
  busy: boolean;
  error: string | null;
  recent: AnalysisSummary[];
  aiEnabled: boolean;
  user: SessionUser | null;
  onAnalyze: (source: string, refresh?: boolean, branch?: string) => void;
  onOpenRecent: (id: string) => void;
  onDismissError: () => void;
}

const BENCHMARKS = [
  {
    target: "samples/demo-app",
    branch: "main",
    title: "Demo app",
    lang: "TypeScript",
    langColor: "text-tertiary",
    desc: "Curated multi-tier TypeScript codebase featuring common architectural antipatterns and circular dependencies.",
    meta: "42 modules • AST Ready",
  },
  {
    target: "https://github.com/expressjs/express.git",
    branch: "master",
    title: "expressjs/express",
    lang: "JavaScript",
    langColor: "text-secondary",
    desc: "Fast, unopinionated, minimalist web framework for Node.js.",
    meta: "114 modules • Core middleware",
  },
  {
    target: "https://github.com/sindresorhus/execa.git",
    branch: "main",
    title: "sindresorhus/execa",
    lang: "TypeScript",
    langColor: "text-tertiary",
    desc: "Process execution for Node.js with cross-platform support.",
    meta: "28 modules • Subprocess graph",
  },
];

export function RepositoryConnection({
  busy,
  error,
  recent,
  aiEnabled,
  user,
  onAnalyze,
  onOpenRecent,
  onDismissError,
}: Props) {
  const [source, setSource] = useState("samples/demo-app");
  const [branch, setBranch] = useState("main");
  const [ghRepos, setGhRepos] = useState<GithubRepo[] | null>(null);

  const reposGranted = Boolean(user?.reposGranted);

  useEffect(() => {
    if (!reposGranted) return;
    let cancelled = false;
    api
      .githubRepos()
      .then((r) => {
        if (!cancelled) setGhRepos(r.repos);
      })
      .catch(() => {
        if (!cancelled) setGhRepos(null);
      });
    return () => {
      cancelled = true;
    };
  }, [reposGranted]);

  const submit = (targetPath?: string, branchOverride?: string) => {
    const val = (targetPath ?? source).trim();
    if (!val || busy) return;
    onAnalyze(val, false, branchOverride ?? (branch.trim() || undefined));
  };

  const fillInput = (targetPath: string, branchName: string) => {
    setSource(targetPath);
    setBranch(branchName);
  };

  const userName = user?.name || "arjun-patel";

  return (
    <div className="flex flex-col w-full bg-background min-h-screen">
      <div className="p-space-lg max-w-7xl mx-auto w-full space-y-space-xl">
        {/* Header Section with Telemetry Meta */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md border-b border-surface-variant pb-space-lg">
          <div className="space-y-space-xs max-w-3xl">
            <div className="flex items-center gap-space-sm mb-1">
              <span className="font-micro-label text-micro-label text-primary uppercase tracking-widest font-semibold">
                Workspace Initialization
              </span>
              <span className="text-surface-variant">•</span>
              <span className="font-micro-label text-micro-label text-on-surface-variant uppercase font-mono">
                Engine Core v4.19
              </span>
            </div>
            <h1 className="font-headline-xl text-headline-xl text-on-surface font-semibold tracking-tight">
              Analyse a repository
            </h1>
            <p className="font-body-default text-body-default text-on-surface-variant leading-relaxed">
              Provide a local directory path, Git repository URL, or select from authorized GitHub
              repositories. Analyses run locally and generate complete AST call graphs.
            </p>
          </div>

          {/* Status Pill */}
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-surface-container border border-surface-variant self-start md:self-auto shrink-0 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-tertiary"></span>
            </span>
            <span className="font-micro-label text-micro-label text-on-surface font-medium uppercase tracking-wider">
              {aiEnabled ? "AI narration on" : "Static AST engine on"}
            </span>
          </div>
        </div>

        {/* Error notification banner if any */}
        {error && (
          <div className="p-3 rounded bg-error-container/20 border border-error-container text-error flex items-center justify-between text-body-compact">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{error}</span>
            </div>
            <button
              onClick={onDismissError}
              className="p-1 hover:text-on-surface transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}

        {/* Primary Input Section */}
        <section className="bg-surface-container-low rounded-lg border border-surface-variant p-space-lg shadow-sm">
          <div className="flex items-center justify-between mb-space-md pb-space-xs border-b border-surface-variant/40">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[16px] text-primary">terminal</span>
              <span className="font-micro-label text-micro-label text-on-surface-variant uppercase tracking-wider font-semibold">
                REPOSITORY SOURCE
              </span>
            </div>
            <span className="font-micro-label text-micro-label text-on-surface-variant font-mono">
              Protocol: Local FS / SSH / HTTPS
            </span>
          </div>

          <form
            className="space-y-space-md"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
              <div className="lg:col-span-9 flex flex-col gap-1.5">
                <label
                  className="font-micro-label text-micro-label text-on-surface-variant uppercase"
                  htmlFor="repo-target"
                >
                  TARGET DIRECTORY OR REMOTE REPOSITORY URL
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-2.5 text-[16px] text-on-surface-variant pointer-events-none">
                    folder_data
                  </span>
                  <input
                    className="w-full h-8 pl-8 pr-3 bg-surface-container-lowest border border-surface-variant rounded text-code-default font-code-default text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-secondary transition-colors"
                    id="repo-target"
                    placeholder="e.g. samples/demo-app or git@github.com:org/repo.git"
                    required
                    type="text"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  />
                </div>
              </div>

              <div className="lg:col-span-3 flex flex-col gap-1.5">
                <label
                  className="font-micro-label text-micro-label text-on-surface-variant uppercase"
                  htmlFor="repo-branch"
                >
                  BRANCH (OPTIONAL)
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-2.5 text-[16px] text-on-surface-variant pointer-events-none">
                    alt_route
                  </span>
                  <input
                    className="w-full h-8 pl-8 pr-3 bg-surface-container-lowest border border-surface-variant rounded text-code-default font-code-default text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-secondary transition-colors"
                    id="repo-branch"
                    placeholder="main"
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-space-xs gap-space-sm border-t border-surface-variant/40">
              <div className="flex items-center gap-space-sm text-micro-label font-micro-label text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-tertiary">lock</span>
                <span>Static analyzer does not emit codebase artifacts outside your local host.</span>
              </div>
              <button
                className="h-8 px-4 flex items-center gap-2 rounded bg-primary-container text-on-primary-container font-headline-sm text-body-bold hover:brightness-110 active:brightness-95 transition-all self-end sm:self-auto cursor-pointer font-medium"
                id="analyse-submit-btn"
                type="submit"
                disabled={busy}
              >
                <span className={`material-symbols-outlined text-[16px] ${busy ? "animate-spin" : ""}`}>
                  {busy ? "refresh" : "play_arrow"}
                </span>
                <span>{busy ? "Parsing AST..." : "Analyse"}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Sample Repositories Grid */}
        <section className="space-y-space-sm">
          <div className="flex items-center justify-between pb-space-xs border-b border-surface-variant">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">dataset</span>
              <span className="font-micro-label text-micro-label text-on-surface-variant uppercase tracking-wider font-semibold">
                SAMPLE REPOSITORIES
              </span>
            </div>
            <span className="font-micro-label text-micro-label text-on-surface-variant font-mono">
              Quick start benchmarks
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md pt-space-xs">
            {BENCHMARKS.map((sample) => (
              <div
                key={sample.target}
                className="group flex flex-col justify-between bg-surface-container-high rounded border border-surface-variant p-space-md hover:border-outline transition-colors"
              >
                <div className="space-y-space-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold group-hover:text-primary transition-colors">
                      {sample.title}
                    </span>
                    <span
                      className={`font-micro-label text-micro-label px-1.5 py-0.5 rounded border border-surface-variant bg-surface-container-lowest ${sample.langColor}`}
                    >
                      {sample.lang}
                    </span>
                  </div>
                  <p className="font-body-compact text-body-compact text-on-surface-variant leading-relaxed">
                    {sample.desc}
                  </p>
                </div>
                <div className="pt-space-md mt-space-md border-t border-surface-variant/40 flex items-center justify-between">
                  <span className="font-code-compact text-code-compact text-on-surface-variant">
                    {sample.meta}
                  </span>
                  <button
                    className="h-7 px-2.5 flex items-center gap-1.5 rounded border border-surface-variant bg-transparent text-body-compact font-body-compact text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
                    type="button"
                    onClick={() => {
                      fillInput(sample.target, sample.branch);
                      submit(sample.target, sample.branch);
                    }}
                  >
                    <span className="material-symbols-outlined text-[14px]">download</span>
                    <span>Load sample</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Authorized GitHub Repositories Section */}
        <section className="space-y-space-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-space-xs border-b border-surface-variant">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                source_notes
              </span>
              <span className="font-micro-label text-micro-label text-on-surface-variant uppercase tracking-wider font-semibold">
                YOUR GITHUB REPOSITORIES
              </span>
            </div>
            <a
              className="font-code-compact text-code-compact text-secondary hover:underline flex items-center gap-1"
              href={api.githubOAuthUrl()}
            >
              Grant access to additional repositories →
            </a>
          </div>

          <div className="flex items-center justify-between bg-surface-container-low px-space-md py-2.5 rounded border border-surface-variant">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[18px] text-tertiary">account_circle</span>
              <span className="font-body-compact text-body-compact text-on-surface">
                Connected as <strong className="font-code-compact text-on-surface font-semibold">@{userName}</strong>.{" "}
                {ghRepos ? `${ghRepos.length} repositories detected.` : "OAuth active; request repository scope to list them."}
              </span>
            </div>
            <span className="font-micro-label text-micro-label px-2 py-0.5 rounded border border-tertiary-container bg-tertiary-container/10 text-tertiary font-mono">
              {user?.reposGranted ? "OAuth Sync Valid" : "Identity Only"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-sm">
            {ghRepos === null && (
              <div className="md:col-span-2 lg:col-span-3 flex items-center justify-between bg-surface-container-low px-space-md py-2.5 rounded border border-surface-variant">
                <div className="flex items-center gap-space-sm">
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">lock</span>
                  <span className="font-body-compact text-body-compact text-on-surface-variant">
                    No repository list yet. Grant read access so CodeAtlas can list your GitHub repositories and analyse private ones.
                  </span>
                </div>
                <a
                  className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded border border-surface-variant bg-surface-container hover:bg-surface-container-high text-on-surface font-body-bold text-body-compact transition-colors shrink-0"
                  href={api.githubOAuthUrl()}
                >
                  <span className="material-symbols-outlined text-[15px]">key</span>
                  <span>Grant access</span>
                </a>
              </div>
            )}
            {ghRepos && ghRepos.length === 0 && (
              <div className="md:col-span-2 lg:col-span-3 px-space-md py-2 text-body-compact text-on-surface-variant">
                Your GitHub account has no repositories visible with the granted scope.
              </div>
            )}
            {ghRepos && ghRepos.length > 0 && (
              ghRepos.slice(0, 6).map((r) => (
                <div
                  key={r.fullName}
                  className="flex items-center justify-between p-space-sm rounded bg-surface-container border border-surface-variant/60 hover:border-surface-variant transition-colors"
                >
                  <div className="flex items-center gap-space-sm min-w-0 pr-2">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                      {r.private ? "lock" : "public"}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-code-compact text-code-compact text-on-surface font-medium truncate">
                        {r.fullName}
                      </span>
                      <span className="font-micro-label text-micro-label text-on-surface-variant">
                        {r.language || "TypeScript"} · {r.defaultBranch || "main"}
                      </span>
                    </div>
                  </div>
                  <button
                    className="p-1 hover:text-primary transition-colors text-on-surface-variant cursor-pointer shrink-0"
                    onClick={() => {
                      const url = `https://github.com/${r.fullName}.git`;
                      fillInput(url, r.defaultBranch || "main");
                      submit(url, r.defaultBranch || "main");
                    }}
                    title="Select and analyze"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Previously Analysed Table */}
        <section className="space-y-space-sm pb-space-xl">
          <div className="flex items-center justify-between pb-space-xs border-b border-surface-variant">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">history</span>
              <span className="font-micro-label text-micro-label text-on-surface-variant uppercase tracking-wider font-semibold">
                PREVIOUSLY ANALYSED
              </span>
            </div>
            <span className="font-micro-label text-micro-label text-on-surface-variant font-mono">
              Cached index records
            </span>
          </div>

          <div className="bg-surface-container-low rounded border border-surface-variant overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-lowest border-b border-surface-variant font-micro-label text-micro-label text-on-surface-variant uppercase">
                    <th className="py-2 px-space-md font-medium">Repository Identifier</th>
                    <th className="py-2 px-space-md font-medium">Analysis Age</th>
                    <th className="py-2 px-space-md font-medium">Status &amp; Coverage</th>
                    <th className="py-2 px-space-md font-medium text-right">Operation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant/40 font-body-compact text-body-compact">
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-on-surface-variant text-body-compact italic">
                        No previous analyses saved yet.
                      </td>
                    </tr>
                  ) : (
                    recent.map((item) => (
                      <tr key={item.id} className="hover:bg-surface-container/60 transition-colors">
                        <td className="py-2.5 px-space-md">
                          <div className="flex items-center gap-space-sm">
                            <span className="material-symbols-outlined text-[16px] text-tertiary">
                              check_circle
                            </span>
                            <span
                              className="font-code-compact text-code-compact text-on-surface font-medium cursor-pointer hover:underline"
                              onClick={() => onOpenRecent(item.id)}
                            >
                              {item.name}
                            </span>
                            <span className="font-micro-label text-micro-label text-on-surface-variant border border-surface-variant px-1 rounded uppercase font-mono">
                              {item.kind || "local"}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-space-md text-on-surface-variant font-code-compact text-code-compact">
                          {timeAgo(item.analyzedAt)}
                        </td>
                        <td className="py-2.5 px-space-md">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-tertiary"></span>
                            <span className="font-body-compact text-body-compact text-on-surface">
                              Completed ({item.files} files)
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-space-md text-right">
                          <button
                            className="h-6 px-2.5 inline-flex items-center gap-1 rounded border border-surface-variant bg-surface-container hover:bg-surface-container-high text-on-surface font-body-compact text-body-compact transition-colors cursor-pointer"
                            type="button"
                            onClick={() => onOpenRecent(item.id)}
                          >
                            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
                              folder_open
                            </span>
                            <span>Open</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}