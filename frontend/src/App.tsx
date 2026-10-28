// Application shell: chrome, routing between views, and global overlays.
// All workspace state lives in `useWorkspace`; this file only arranges it.

import { useCallback, useEffect, useState } from "react";
import { FolderGit2, Plus } from "lucide-react";

import { useWorkspace, VIEW_TITLES, type ViewId } from "./state/useWorkspace";
import { AuthBoot, AuthView } from "./components/pages/AuthView";

import { ApplicationSidebar } from "./components/layout/ApplicationSidebar";
import { WorkspaceHeader } from "./components/layout/WorkspaceHeader";
import { ContextualRightPanel } from "./components/layout/ContextualRightPanel";

import { OverviewDashboard } from "./components/pages/OverviewDashboard";
import { RepositoryConnection } from "./components/pages/RepositoryConnection";
import { ArchitectureExplorer } from "./components/pages/ArchitectureExplorer";
import { DependencyGraphView } from "./components/pages/DependencyGraphView";
import { CodeExplorerView } from "./components/pages/CodeExplorerView";
import { AIAssistantView } from "./components/pages/AIAssistantView";
import { ArchitectureInsightsView } from "./components/pages/ArchitectureInsightsView";
import { DocumentationWorkspace } from "./components/pages/DocumentationWorkspace";
import { AnalysisHistoryView } from "./components/pages/AnalysisHistoryView";
import { SettingsView } from "./components/pages/SettingsView";

import { AnalysisProgress } from "./components/AnalysisProgress";
import { CommandPalette } from "./components/modals/CommandPalette";
import { ShortcutsModal } from "./components/modals/ShortcutsModal";
import { HelpModal } from "./components/modals/HelpModal";
import { ToastContainer } from "./components/ui/Toast";
import { ConfirmationDialog, Logo } from "./components/ui";

export default function App() {
  const ws = useWorkspace();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const {
    authStatus,
    user,
    providers,
    dashboard,
    analysis,
    view,
    needsRepo,
    navigate,
    openFile,
    focusModule,
    askAbout,
    setInspectorOpen,
    inspectorOpen,
  } = ws;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const narrow = window.matchMedia("(max-width: 768px)").matches;
      if (narrow && e.key === "Escape") {
        setMobileNavOpen(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((p) => !p);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setInspectorOpen(!inspectorOpen);
      } else if (e.key === "?" && !typing) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inspectorOpen, mobileNavOpen, setInspectorOpen]);

  useEffect(() => {
    document.body.classList.toggle("nav-open", mobileNavOpen);
    return () => document.body.classList.remove("nav-open");
  }, [mobileNavOpen]);

  const goto = useCallback(
    (next: ViewId) => {
      setPaletteOpen(false);
      navigate(next);
    },
    [navigate],
  );

  // Session gate: nothing renders before the server has answered who we are.
  if (authStatus === "loading") return <AuthBoot />;
  if (authStatus === "anon") {
    return (
      <AuthView
        providers={providers}
        error={ws.error}
        onRegister={ws.register}
        onSignIn={ws.signIn}
      />
    );
  }

  const renderView = () => {
    if (needsRepo) return <NoRepo onConnect={() => navigate("repositories")} />;
    switch (view) {
      case "repositories":
        return (
          <RepositoryConnection
            error={ws.error}
            recent={ws.recent}
            aiEnabled={ws.aiEnabled}
            busy={ws.busy}
            user={user}
            onAnalyze={ws.analyze}
            onOpenRecent={ws.openCached}
            onDismissError={ws.dismissError}
          />
        );
      case "history":
        return (
          <AnalysisHistoryView
            analysis={analysis}
            recent={ws.recent}
            onOpenRepo={ws.openCached}
            onReanalyze={(id) => {
              const target = ws.recent.find((r) => r.id === id);
              if (target) void ws.analyze(target.source, true);
            }}
            onDeleteRepo={ws.requestDelete}
            onAddRepo={() => navigate("repositories")}
          />
        );
      case "settings":
        return (
          <SettingsView
            user={user}
            theme={ws.theme}
            onToggleTheme={ws.toggleTheme}
            onShowToast={(msg) => ws.addToast(msg, "success")}
            onUserChanged={ws.adoptUser}
            onSignOut={ws.logout}
          />
        );
      case "overview":
        return (
          <OverviewDashboard
            analysis={analysis}
            user={user}
            dashboard={dashboard}
            onOpenFile={openFile}
            onOpenRecent={ws.openCached}
            onFocusModule={focusModule}
            onAskAbout={askAbout}
            onAddRepo={() => navigate("repositories")}
            onOpenRepos={() => navigate("repositories")}
            onOpenArchitecture={() => navigate("architecture")}
            onOpenDependencies={() => navigate("dependencies")}
            onOpenInsights={() => navigate("insights")}
            onOpenDocs={() => navigate("docs")}
          />
        );
      case "architecture":
        return (
          <ArchitectureExplorer
            analysis={analysis!}
            selectedModuleId={ws.selectedModuleId}
            onSelectModule={ws.setSelectedModuleId}
            onOpenFile={openFile}
          />
        );
      case "dependencies":
        return (
          <DependencyGraphView
            analysis={analysis!}
            selectedNodeId={ws.selectedFilePath}
            onSelectNode={ws.setSelectedFilePath}
            onOpenFile={openFile}
          />
        );
      case "explorer":
        return (
          <CodeExplorerView
            analysis={analysis!}
            selectedPath={ws.selectedFilePath}
            onSelectPath={ws.setSelectedFilePath}
            onAskAbout={askAbout}
          />
        );
      case "assistant":
        return (
          <AIAssistantView
            analysis={analysis!}
            aiEnabled={ws.aiEnabled}
            initialPrompt={ws.assistantPrompt}
            onOpenFile={openFile}
            onShowToast={(msg) => ws.addToast(msg, "info")}
          />
        );
      case "insights":
        return (
          <ArchitectureInsightsView
            analysis={analysis!}
            onOpenFile={openFile}
            onSelectIssue={ws.selectIssue}
            onAskAbout={askAbout}
          />
        );
      case "docs":
        return <DocumentationWorkspace analysis={analysis!} />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-on-surface">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <ApplicationSidebar
        view={view}
        onNavigate={(id) => {
          setMobileNavOpen(false);
          navigate(id);
        }}
        analysis={analysis}
        recent={ws.recent}
        user={user}
        onSelectRepo={(r) => {
          setMobileNavOpen(false);
          ws.openCached(r);
        }}
        onNewRepo={() => navigate("repositories")}
        aiEnabled={ws.aiEnabled}
        theme={ws.theme}
        onToggleTheme={ws.toggleTheme}
        onSignOut={ws.logout}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        mobileNavOpen={mobileNavOpen}
      />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden pl-0 md:pl-60">
        <WorkspaceHeader
          title={VIEW_TITLES[view]}
          analysis={analysis}
          busy={ws.busy}
          canAnalyze={Boolean(analysis)}
          user={user}
          onReanalyze={ws.reanalyze}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          isInspectorOpen={inspectorOpen}
          onToggleInspector={() => setInspectorOpen(!inspectorOpen)}
          onToggleMobileNav={() => setMobileNavOpen((p) => !p)}
        />

        <div className="flex-1 flex overflow-hidden pt-12 relative min-h-0">
          <main className="flex-1 overflow-y-auto bg-background min-w-0" key={analysis?.repo.id ?? "none"}>
            {renderView()}
          </main>

          {inspectorOpen && (
            <ContextualRightPanel
              isOpen
              onClose={() => setInspectorOpen(false)}
              analysis={analysis}
              selectedModuleId={ws.selectedModuleId}
              selectedFilePath={ws.selectedFilePath}
              selectedIssueId={ws.selectedIssueId}
              onOpenFile={openFile}
              onFocusModule={focusModule}
              onAskAbout={askAbout}
            />
          )}
        </div>
      </div>

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        analysis={analysis}
        recent={ws.recent}
        onNavigate={goto}
        onSelectRepo={ws.openCached}
        onOpenFile={openFile}
        onFocusModule={focusModule}
        onReanalyze={ws.reanalyze}
      />

      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />

      <ConfirmationDialog
        isOpen={Boolean(ws.deleteTarget)}
        title="Delete cached analysis"
        message="Remove this repository's stored analysis? You can always re-analyze it later."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => ws.deleteTarget && void ws.deleteAnalysis(ws.deleteTarget)}
        onCancel={ws.cancelDelete}
      />

      <ToastContainer toasts={ws.toasts} onDismiss={ws.dismissToast} />

      {ws.job?.status === "running" && <AnalysisProgress job={ws.job} />}
    </div>
  );
}

function NoRepo({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="card empty-repo-card">
      <div className="empty-repo-logo">
        <Logo size={54} />
      </div>
      <h2>No repository loaded</h2>
      <p>
        Connect a GitHub repository or open a local folder. CodeAtlas will map its architecture, trace
        dependencies, and flag structural drift.
      </p>
      <button className="btn primary" onClick={onConnect}>
        <Plus size={14} style={{ marginRight: 5 }} />
        Connect a repository
      </button>
      <span className="empty-repo-hint">
        <FolderGit2 size={12} />
        Try <code>samples/demo-app</code> for a guided tour
      </span>
    </div>
  );
}