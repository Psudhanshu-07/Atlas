import { useEffect, useMemo, useRef, useState } from "react";
import type { Analysis, AnalysisSummary } from "../../../shared/types";
import { plural } from "../../../shared/format";
import type { ViewId } from "../../state/useWorkspace";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  analysis: Analysis | null;
  recent: AnalysisSummary[];
  onNavigate: (view: ViewId) => void;
  onSelectRepo: (id: string) => void;
  onOpenFile: (path: string) => void;
  onFocusModule: (moduleId: string) => void;
  onReanalyze: () => void;
}

interface CommandItem {
  id: string;
  category: "Navigation" | "Repositories" | "Files" | "Modules" | "Actions";
  title: string;
  subtitle?: string;
  shortcut?: string;
  action: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  analysis,
  recent,
  onNavigate,
  onSelectRepo,
  onOpenFile,
  onFocusModule,
  onReanalyze,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const items = useMemo(() => {
    const list: CommandItem[] = [
      {
        id: "nav-overview",
        category: "Navigation",
        title: "Overview Dashboard",
        subtitle: "Global control centre & connected repositories",
        shortcut: "1",
        action: () => {
          onNavigate("overview");
          onClose();
        },
      },
      {
        id: "nav-repositories",
        category: "Navigation",
        title: "Repositories",
        subtitle: "Connect and manage repositories",
        shortcut: "2",
        action: () => {
          onNavigate("repositories");
          onClose();
        },
      },
      {
        id: "nav-architecture",
        category: "Navigation",
        title: "Architecture Explorer",
        subtitle: "Visual layered module relationships canvas",
        shortcut: "3",
        action: () => {
          onNavigate("architecture");
          onClose();
        },
      },
      {
        id: "nav-dependencies",
        category: "Navigation",
        title: "Dependency Graph",
        subtitle: "Interactive module and file dependency network",
        shortcut: "4",
        action: () => {
          onNavigate("dependencies");
          onClose();
        },
      },
      {
        id: "nav-explorer",
        category: "Navigation",
        title: "Code Search & Explorer",
        subtitle: "IDE file browser with annotations and AI explanation",
        shortcut: "5",
        action: () => {
          onNavigate("explorer");
          onClose();
        },
      },
      {
        id: "nav-assistant",
        category: "Navigation",
        title: "AI Codebase Assistant",
        subtitle: "Repository-aware architecture queries",
        shortcut: "6",
        action: () => {
          onNavigate("assistant");
          onClose();
        },
      },
      {
        id: "nav-docs",
        category: "Navigation",
        title: "Documentation Generator",
        subtitle: "Automated architecture guides and technical specs",
        shortcut: "7",
        action: () => {
          onNavigate("docs");
          onClose();
        },
      },
      {
        id: "nav-history",
        category: "Navigation",
        title: "Analysis History",
        subtitle: "Past analysis runs, durations and metrics",
        shortcut: "8",
        action: () => {
          onNavigate("history");
          onClose();
        },
      },
      {
        id: "nav-settings",
        category: "Navigation",
        title: "Settings & Configuration",
        subtitle: "Analysis rules, AI keys and preferences",
        shortcut: "9",
        action: () => {
          onNavigate("settings");
          onClose();
        },
      },
    ];

    if (analysis) {
      list.push({
        id: "action-reanalyze",
        category: "Actions",
        title: `Re-analyze ${analysis.repo.name}`,
        subtitle: "Run fresh crawl, dependency parse and architecture detection",
        action: () => {
          onReanalyze();
          onClose();
        },
      });

      // Modules
      for (const cluster of analysis.clusters) {
        list.push({
          id: `module-${cluster.id}`,
          category: "Modules",
          title: `Module: ${cluster.name}`,
          subtitle: `${plural(cluster.files, "file")} · ${cluster.role} (${cluster.lines} LOC)`,
          action: () => {
            onFocusModule(cluster.id);
            onNavigate("architecture");
            onClose();
          },
        });
      }

      // Top files
      for (const node of analysis.nodes.slice(0, 50)) {
        list.push({
          id: `file-${node.path}`,
          category: "Files",
          title: node.path,
          subtitle: `${node.language} · ${node.loc} LOC · module: ${node.cluster}`,
          action: () => {
            onOpenFile(node.path);
            onNavigate("explorer");
            onClose();
          },
        });
      }
    }

    // Repositories
    for (const r of recent) {
      list.push({
        id: `repo-${r.id}`,
        category: "Repositories",
        title: `Switch repo: ${r.name}`,
        subtitle: `${plural(r.files, "file")} · ${plural(r.issues, "finding")} · ${r.kind}`,
        action: () => {
          onSelectRepo(r.id);
          onClose();
        },
      });
    }

    if (!query.trim()) return list;

    const q = query.toLowerCase();
    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        item.category.toLowerCase().includes(q),
    );
  }, [analysis, recent, query, onNavigate, onSelectRepo, onOpenFile, onFocusModule, onReanalyze, onClose]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < items.length ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].action();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="command-palette-dialog" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-wrap">
          <svg className="palette-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, file, module or repository..."
          />
          <kbd className="palette-kbd">ESC to close</kbd>
        </div>

        <div className="palette-results">
          {items.length === 0 ? (
            <div className="palette-empty">No results found for "{query}"</div>
          ) : (
            items.map((item, index) => (
              <div
                key={item.id}
                className={`palette-item ${index === selectedIndex ? "active" : ""}`}
                onClick={item.action}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="palette-item-badge">{item.category}</span>
                <div className="palette-item-text">
                  <div className="palette-item-title">{item.title}</div>
                  {item.subtitle && <div className="palette-item-sub">{item.subtitle}</div>}
                </div>
                {item.shortcut && <kbd className="palette-item-shortcut">{item.shortcut}</kbd>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
