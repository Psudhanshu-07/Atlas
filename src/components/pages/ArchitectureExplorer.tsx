import { useState, useMemo, useRef } from "react";
import type { Analysis, Cluster, Layer } from "../../../shared/types";
import { plural } from "../../../shared/format";
import { Badge, SearchInput } from "../ui";
import {
  Layers,
  Network,
  LayoutGrid,
  Filter,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
  FileCode,
  ArrowRight,
  X,
  Monitor,
  Zap,
  Cpu,
  Database,
  Server,
  Wrench,
  FlaskConical,
} from "lucide-react";

interface Props {
  analysis: Analysis;
  selectedModuleId: string | null;
  onSelectModule: (moduleId: string | null) => void;
  onOpenFile: (path: string) => void;
}

const LAYER_CONFIG: Record<
  string,
  { label: string; color: string; desc: string }
> = {
  presentation: {
    label: "Presentation Tier",
    color: "#39C5CF",
    desc: "User-facing components, views, pages, and interactive interface controllers",
  },
  api: {
    label: "API & Router Gateway",
    color: "#2F81F7",
    desc: "HTTP routes, REST endpoint controllers, validation schemas, and middlewares",
  },
  business: {
    label: "Core Business Logic",
    color: "#E53935",
    desc: "Domain workflows, processing engines, business services, and rules",
  },
  data: {
    label: "Data Access & Storage",
    color: "#3FB950",
    desc: "Database models, persistent repository queries, session stores, and cache",
  },
  ops: {
    label: "Infrastructure & Ops",
    color: "#D29922",
    desc: "Configuration, server bootstrapping, build scripts, and deployments",
  },
  shared: {
    label: "Shared Utilities",
    color: "#8B949E",
    desc: "Logging, helpers, formatters, and reusable cross-cutting tools",
  },
  tests: {
    label: "Test Suites",
    color: "#6E7681",
    desc: "Automated unit, integration, and end-to-end regression tests",
  },
};

function getLayerIcon(id: string) {
  switch (id) {
    case "presentation":
      return <Monitor size={15} />;
    case "api":
      return <Zap size={15} />;
    case "business":
      return <Cpu size={15} />;
    case "data":
      return <Database size={15} />;
    case "ops":
      return <Server size={15} />;
    case "shared":
      return <Wrench size={15} />;
    case "tests":
      return <FlaskConical size={15} />;
    default:
      return <Cpu size={15} />;
  }
}

export function ArchitectureExplorer({
  analysis,
  selectedModuleId,
  onSelectModule,
  onOpenFile,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedLayerId, setSelectedLayerId] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"diagram" | "blueprint">("diagram");
  const [zoom, setZoom] = useState({ scale: 1, x: 20, y: 20 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Map each cluster to its architectural layer
  const clusterLayerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cluster of analysis.clusters) {
      const files = analysis.nodes.filter((n) => n.cluster === cluster.id);
      if (files.length === 0) {
        map.set(cluster.id, "business");
        continue;
      }
      const counts = new Map<string, number>();
      for (const f of files) {
        counts.set(f.layer, (counts.get(f.layer) ?? 0) + 1);
      }
      let topLayer = "business";
      let maxCount = -1;
      for (const [layerId, count] of counts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          topLayer = layerId;
        }
      }
      map.set(cluster.id, topLayer);
    }
    return map;
  }, [analysis.clusters, analysis.nodes]);

  // Cluster-to-cluster dependencies
  const clusterEdges = useMemo(() => {
    const counts = new Map<string, number>();
    const nodeCluster = new Map(analysis.nodes.map((n) => [n.path, n.cluster]));

    for (const edge of analysis.edges) {
      const from = nodeCluster.get(edge.from);
      const to = nodeCluster.get(edge.to);
      if (from && to && from !== to) {
        const key = `${from}===>${to}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    const list: Array<{ from: string; to: string; count: number }> = [];
    for (const [key, count] of counts.entries()) {
      const [from, to] = key.split("===>");
      list.push({ from, to, count });
    }
    return list;
  }, [analysis.edges, analysis.nodes]);

  // Filter modules
  const filteredClusters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return analysis.clusters.filter((c) => {
      const layer = clusterLayerMap.get(c.id) || "business";
      if (selectedLayerId !== "all" && layer !== selectedLayerId) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.role.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [analysis.clusters, search, selectedLayerId, clusterLayerMap]);

  // Selected module details
  const selectedCluster = analysis.clusters.find((c) => c.id === selectedModuleId);
  const selectedFiles = selectedCluster
    ? analysis.nodes.filter((n) => n.cluster === selectedCluster.id)
    : [];

  const incomingModules = useMemo(() => {
    if (!selectedModuleId) return [];
    return clusterEdges
      .filter((e) => e.to === selectedModuleId)
      .map((e) => ({
        cluster: analysis.clusters.find((c) => c.id === e.from)!,
        count: e.count,
      }))
      .filter((item) => Boolean(item.cluster));
  }, [selectedModuleId, clusterEdges, analysis.clusters]);

  const outgoingModules = useMemo(() => {
    if (!selectedModuleId) return [];
    return clusterEdges
      .filter((e) => e.from === selectedModuleId)
      .map((e) => ({
        cluster: analysis.clusters.find((c) => c.id === e.to)!,
        count: e.count,
      }))
      .filter((item) => Boolean(item.cluster));
  }, [selectedModuleId, clusterEdges, analysis.clusters]);

  const presentLayers = useMemo(() => {
    const ordered = ["presentation", "api", "business", "data", "ops", "shared", "tests"];
    return ordered.filter((k) =>
      analysis.clusters.some((c) => (clusterLayerMap.get(c.id) || "business") === k)
    );
  }, [analysis.clusters, clusterLayerMap]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - zoom.x, y: e.clientY - zoom.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setZoom((prev) => ({
      ...prev,
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    }));
  };

  const handleMouseUp = () => setIsPanning(false);

  return (
    <div className="architecture-workspace-clean">
      {/* Top Header & Visual Controls Bar */}
      <div className="arch-header-card">
        <div className="arch-header-left">
          <div className="arch-title-row">
            <span className="arch-shield-icon">
              <Network size={20} color="var(--accent-primary)" />
            </span>
            <div>
              <h1 className="arch-heading">Architecture Explorer & System Topology</h1>
              <p className="arch-sub">
                Explore structural tiers, request dataflow pathways, and cross-module couplings in{" "}
                <code>{analysis.repo.name}</code>.
              </p>
            </div>
          </div>
        </div>

        <div className="arch-header-actions">
          <div className="view-mode-toggle">
            <button
              className={`toggle-btn ${viewMode === "diagram" ? "active" : ""}`}
              onClick={() => setViewMode("diagram")}
            >
              <Network size={13} style={{ marginRight: "6px" }} />
              Interactive Topology Map
            </button>
            <button
              className={`toggle-btn ${viewMode === "blueprint" ? "active" : ""}`}
              onClick={() => setViewMode("blueprint")}
            >
              <LayoutGrid size={13} style={{ marginRight: "6px" }} />
              System Dataflow Blueprint
            </button>
          </div>
        </div>
      </div>

      {/* Visual System Architecture Diagram (Blueprint View) */}
      {viewMode === "blueprint" && (
        <div className="card blueprint-card">
          <div className="blueprint-head">
            <h3>System Dataflow & Architectural Request Lifecycle</h3>
            <span className="live-status-tag">Deterministic AST Grounded</span>
          </div>
          <p className="blueprint-intro">
            This visual diagram maps how requests and data circulate through the architectural layers of{" "}
            <strong>{analysis.repo.name}</strong> from client ingestion to persistence.
          </p>

          <div className="blueprint-pipeline-track">
            {presentLayers.map((layerKey, idx) => {
              const cfg = LAYER_CONFIG[layerKey] || LAYER_CONFIG.business;
              const clustersInLayer = analysis.clusters.filter(
                (c) => (clusterLayerMap.get(c.id) || "business") === layerKey
              );

              return (
                <div key={layerKey} className="blueprint-tier-column">
                  <div className="tier-header-box" style={{ borderTop: `3px solid ${cfg.color}` }}>
                    <div className="tier-icon-title">
                      <span className="tier-icon">{getLayerIcon(layerKey)}</span>
                      <strong className="tier-name">{cfg.label}</strong>
                    </div>
                    <span className="tier-count">{plural(clustersInLayer.length, "module")}</span>
                  </div>

                  <div className="tier-desc">{cfg.desc}</div>

                  <div className="tier-modules-stack">
                    {clustersInLayer.map((c) => (
                      <div
                        key={c.id}
                        className={`tier-mod-pill ${selectedModuleId === c.id ? "selected" : ""}`}
                        onClick={() => {
                          onSelectModule(c.id);
                          setViewMode("diagram");
                        }}
                      >
                        <span className="mod-name-strong">{c.name}</span>
                        <span className="mod-stats-sub">{plural(c.files, "file")} · {c.role}</span>
                      </div>
                    ))}
                  </div>

                  {idx < presentLayers.length - 1 && (
                    <div className="tier-pipeline-arrow">
                      <ArrowRight size={14} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive Topology Diagram Canvas */}
      {viewMode === "diagram" && (
        <div className="arch-main-grid">
          {/* Main Visual Canvas Area */}
          <div className="arch-canvas-container">
            {/* Filter & Command Ribbon */}
            <div className="arch-canvas-toolbar">
              <div className="toolbar-left">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Filter modules by name or role..."
                  className="arch-search-clean"
                />

                <div className="filter-select-wrap">
                  <Filter size={13} color="var(--text-muted)" />
                  <span className="filter-lbl">TIER:</span>
                  <select
                    className="clean-select"
                    value={selectedLayerId}
                    onChange={(e) => setSelectedLayerId(e.target.value)}
                  >
                    <option value="all">All Tiers ({analysis.layers.length})</option>
                    {analysis.layers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <span className="modules-match-tag">
                  {filteredClusters.length} of {plural(analysis.clusters.length, "module")}
                </span>
              </div>

              <div className="toolbar-right">
                <span className="zoom-level-badge">{Math.round(zoom.scale * 100)}%</span>
                <button
                  className="tool-btn"
                  onClick={() => setZoom((z) => ({ ...z, scale: Math.min(2.0, z.scale + 0.15) }))}
                  title="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  className="tool-btn"
                  onClick={() => setZoom((z) => ({ ...z, scale: Math.max(0.4, z.scale - 0.15) }))}
                  title="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  className="tool-btn"
                  onClick={() => setZoom({ scale: 1, x: 20, y: 20 })}
                  title="Reset View"
                >
                  <Maximize2 size={13} />
                  <span>Fit</span>
                </button>
              </div>
            </div>

            {/* Interactive Layered Canvas */}
            <div
              className="arch-canvas-screen"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: isPanning ? "grabbing" : "grab" }}
            >
              <div
                className="arch-zoomable-layer"
                style={{
                  transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                  transformOrigin: "top left",
                }}
              >
                {presentLayers.map((layerKey) => {
                  const cfg = LAYER_CONFIG[layerKey] || LAYER_CONFIG.business;
                  const clustersInLayer = filteredClusters.filter(
                    (c) => (clusterLayerMap.get(c.id) || "business") === layerKey
                  );

                  if (clustersInLayer.length === 0) return null;

                  return (
                    <div key={layerKey} className="canvas-tier-band">
                      <div className="tier-band-header">
                        <div className="band-badge" style={{ color: cfg.color, borderColor: cfg.color }}>
                          <span>{getLayerIcon(layerKey)}</span>
                          <span>{cfg.label}</span>
                        </div>
                        <span className="band-desc">{cfg.desc}</span>
                      </div>

                      <div className="tier-cards-row">
                        {clustersInLayer.map((cluster) => {
                          const isSelected = selectedModuleId === cluster.id;
                          return (
                            <div
                              key={cluster.id}
                              className={`arch-module-card ${isSelected ? "selected" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectModule(isSelected ? null : cluster.id);
                              }}
                              style={{
                                borderTop: `3px solid ${cfg.color}`,
                              }}
                            >
                              <div className="mod-card-top">
                                <span className="mod-card-title">{cluster.name}</span>
                                <Badge variant={cluster.issues > 0 ? "warning" : "muted"}>
                                  {cluster.role}
                                </Badge>
                              </div>

                              <div className="mod-card-metrics">
                                <span className="metric-tag">{plural(cluster.files, "file")}</span>
                                <span className="metric-tag">{cluster.lines.toLocaleString()} LOC</span>
                              </div>

                              <div className="mod-coupling-bar">
                                <span className="inbound-tag">
                                  ↓ {cluster.inbound} callers
                                </span>
                                <span className="outbound-tag">
                                  ↑ {cluster.outbound} calls
                                </span>
                              </div>

                              {cluster.issues > 0 && (
                                <div className="mod-issues-strip">
                                  <AlertTriangle size={12} color="var(--warning)" style={{ marginRight: "4px" }} />
                                  {cluster.issues} {cluster.issues === 1 ? "finding" : "findings"}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Module Deep-Dive Inspector Sidecard */}
          {selectedCluster && (
            <div className="module-detail-sidebar">
              <div className="mod-detail-head">
                <div className="head-title-wrap">
                  <span className="eyebrow-clean">MODULE INSPECTION</span>
                  <h3 className="mod-detail-name">{selectedCluster.name}</h3>
                </div>
                <button
                  className="close-detail-btn"
                  onClick={() => onSelectModule(null)}
                  title="Close inspection"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="mod-detail-scroll">
                {/* Role & Purpose */}
                <div className="detail-section">
                  <span className="detail-label">ARCHITECTURAL ROLE</span>
                  <div className="role-box">
                    <strong>{selectedCluster.role}</strong>
                    <p>
                      Belongs to the{" "}
                      <code>{clusterLayerMap.get(selectedCluster.id)?.toUpperCase() || "BUSINESS"}</code> tier.
                    </p>
                  </div>
                </div>

                {/* Callers (Incoming) */}
                <div className="detail-section">
                  <span className="detail-label">WHO CALLS THIS MODULE ({incomingModules.length})</span>
                  {incomingModules.length === 0 ? (
                    <div className="detail-empty">No other internal modules import this.</div>
                  ) : (
                    <div className="dep-chips-list">
                      {incomingModules.map((item) => (
                        <button
                          key={item.cluster.id}
                          className="chip dep-chip"
                          onClick={() => onSelectModule(item.cluster.id)}
                        >
                          ← {item.cluster.name} ({item.count} imports)
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Callees (Outgoing) */}
                <div className="detail-section">
                  <span className="detail-label">MODULES THIS CALLS ({outgoingModules.length})</span>
                  {outgoingModules.length === 0 ? (
                    <div className="detail-empty">Leaf module: no internal dependencies.</div>
                  ) : (
                    <div className="dep-chips-list">
                      {outgoingModules.map((item) => (
                        <button
                          key={item.cluster.id}
                          className="chip dep-chip"
                          onClick={() => onSelectModule(item.cluster.id)}
                        >
                          → {item.cluster.name} ({item.count} calls)
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Contained Files */}
                <div className="detail-section">
                  <span className="detail-label">CONTAINED FILES ({selectedFiles.length})</span>
                  <div className="files-scroll-list">
                    {selectedFiles.map((f) => (
                      <div
                        key={f.path}
                        className="file-row-btn"
                        onClick={() => onOpenFile(f.path)}
                      >
                        <FileCode size={13} style={{ marginRight: "6px", opacity: 0.8 }} />
                        <span className="file-name-txt">{f.name}</span>
                        <span className="file-loc-txt">{f.loc} LOC</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
