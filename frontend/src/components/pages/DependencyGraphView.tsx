import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";
import type { Analysis, FileNode } from "../../../../shared/types";
import { plural } from "../../../../shared/format";
import { Badge, SearchInput } from "../ui";
import { Network, CheckCircle2, ArrowRightLeft, X } from "lucide-react";

interface Props {
  analysis: Analysis;
  selectedNodeId: string | null;
  onSelectNode: (path: string | null) => void;
  onOpenFile: (path: string) => void;
}

type SimNode = FileNode & SimulationNodeDatum;

const PALETTE = [
  "#2F81F7", "#E53935", "#39C5CF", "#3FB950", "#D29922", "#F85149",
  "#58A6FF", "#FF5252", "#1F6FEB", "#238636", "#9E6A03", "#79C0FF",
];

function nodeRadius(n: FileNode): number {
  return Math.max(5, Math.min(18, 5 + Math.sqrt(Math.max(n.loc, 1)) / 2.2));
}

export function DependencyGraphView({
  analysis,
  selectedNodeId,
  onSelectNode,
  onOpenFile,
}: Props) {
  const [query, setQuery] = useState("");
  const [clusterFilter, setClusterFilter] = useState<string>("all");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"network" | "bottlenecks">("network");
  const [hovered, setHovered] = useState<string | null>(null);

  const canvasRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<SVGGElement | null>(null);
  const [zoom, setZoom] = useState({ k: 1, x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const colorByCluster = useMemo(() => {
    const map = new Map<string, string>();
    analysis.clusters.forEach((c, i) => map.set(c.id, PALETTE[i % PALETTE.length]));
    return map;
  }, [analysis.clusters]);

  const filteredNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return analysis.nodes.filter((n) => {
      if (clusterFilter !== "all" && n.cluster !== clusterFilter) return false;
      if (issuesOnly && n.issueCount === 0) return false;
      if (q && !n.path.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [analysis.nodes, query, clusterFilter, issuesOnly]);

  const visibleSet = useMemo(() => new Set(filteredNodes.map((n) => n.path)), [filteredNodes]);

  const visibleEdges = useMemo(
    () => analysis.edges.filter((e) => visibleSet.has(e.from) && visibleSet.has(e.to)),
    [analysis.edges, visibleSet],
  );

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of visibleEdges) {
      if (!map.has(e.from)) map.set(e.from, new Set());
      if (!map.has(e.to)) map.set(e.to, new Set());
      map.get(e.from)!.add(e.to);
    }
    return map;
  }, [visibleEdges]);

  // Bottleneck ranking (highest fan-in nodes)
  const topBottlenecks = useMemo(() => {
    return [...analysis.nodes]
      .sort((a, b) => b.fanIn - a.fanIn)
      .slice(0, 6);
  }, [analysis.nodes]);

  // Simulation positions
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    const width = 1100;
    const height = 650;
    const simNodes: SimNode[] = filteredNodes.map((n) => ({ ...n }));
    const simNodeMap = new Map(simNodes.map((n) => [n.path, n]));

    const simLinks = visibleEdges
      .map((e) => ({
        source: simNodeMap.get(e.from)!,
        target: simNodeMap.get(e.to)!,
      }))
      .filter((l) => l.source && l.target);

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, any>(simLinks)
          .id((d) => d.path)
          .distance(55)
          .strength(0.35)
      )
      .force("charge", forceManyBody().strength(-110))
      .force("collide", forceCollide<SimNode>().radius((d) => nodeRadius(d) + 8))
      .force("x", forceX(width / 2).strength(0.06))
      .force("y", forceY(height / 2).strength(0.06))
      .stop();

    for (let i = 0; i < 90; i++) sim.tick();

    const pos = new Map<string, { x: number; y: number }>();
    simNodes.forEach((n) => {
      pos.set(n.path, { x: n.x ?? width / 2, y: n.y ?? height / 2 });
    });
    setPositions(pos);
  }, [filteredNodes, visibleEdges]);

  // Pan controls
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - zoom.x, y: e.clientY - zoom.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    setZoom((prev) => ({
      ...prev,
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    }));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const selectedNode = analysis.nodes.find((n) => n.path === selectedNodeId);

  return (
    <div className="dep-graph-workspace">
      {/* Top Header Card */}
      <div className="dep-header-card">
        <div className="dep-header-left">
          <div className="dep-title-row">
            <span className="dep-spider-icon" style={{ display: "inline-flex", alignItems: "center" }}><Network size={20} /></span>
            <div>
              <h1 className="dep-heading">Dependency Graph & Coupling Matrix</h1>
              <p className="dep-sub">
                Explore relationships, identify coupling bottlenecks, and detect circular chains in{" "}
                <code>{analysis.repo.name}</code>.
              </p>
            </div>
          </div>
        </div>

        <div className="dep-header-actions">
          <div className="view-mode-toggle">
            <button
              className={`toggle-btn ${viewMode === "network" ? "active" : ""}`}
              onClick={() => setViewMode("network")}
            >
              Interactive Network
            </button>
            <button
              className={`toggle-btn ${viewMode === "bottlenecks" ? "active" : ""}`}
              onClick={() => setViewMode("bottlenecks")}
            >
              Coupling Bottlenecks & Loops ({analysis.cycles.length})
            </button>
          </div>
        </div>
      </div>

      {/* Bottlenecks & Coupling Radar View */}
      {viewMode === "bottlenecks" && (
        <div className="card bottleneck-view-card">
          <div className="bottleneck-grid-2">
            {/* Top Critical Hubs */}
            <div className="hub-section">
              <span className="section-title-bold">HIGH COUPLING CONCENTRATION (TOP INCOMING HUBS)</span>
              <p className="section-sub-clean">
                These files have the highest number of callers (fan-in). Changes to these files risk cascading breakages across the entire project.
              </p>
              <div className="hub-cards-list">
                {topBottlenecks.map((node, i) => (
                  <div
                    key={node.path}
                    className="hub-card-item"
                    onClick={() => {
                      onSelectNode(node.path);
                      setViewMode("network");
                    }}
                  >
                    <div className="hub-rank-badge">#{i + 1}</div>
                    <div className="hub-card-info">
                      <div className="hub-card-title">
                        <code>{node.name}</code>
                        <span className="hub-card-path">{node.path}</span>
                      </div>
                      <div className="hub-card-stats">
                        <span className="fanin-tag">Imported by {plural(node.fanIn, "file")}</span>
                        <span className="loc-tag">{node.loc} LOC</span>
                        <span className="cluster-tag">module: {node.cluster}</span>
                      </div>
                    </div>
                    <button
                      className="btn ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFile(node.path);
                      }}
                    >
                      Read Code →
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Circular Dependency Chains */}
            <div className="cycles-section">
              <span className="section-title-bold">CIRCULAR DEPENDENCY CHAINS ({analysis.cycles.length})</span>
              <p className="section-sub-clean">
                Mutual dependency loops where Module A imports B, and B imports A. This tightly couples modules and causes bundling bugs.
              </p>
              {analysis.cycles.length === 0 ? (
                <div className="empty-cycles-card">
                  <CheckCircle2 size={32} style={{ color: "var(--success)", marginBottom: "8px" }} />
                  <strong>No circular dependency cycles detected</strong>
                  <p>The dependency graph is a clean Directed Acyclic Graph (DAG).</p>
                </div>
              ) : (
                <div className="cycles-list">
                  {analysis.cycles.map((cycle, idx) => (
                    <div key={idx} className="cycle-item-card">
                      <div className="cycle-header">
                        <Badge variant="danger">CYCLE #{idx + 1}</Badge>
                        <span className="cycle-length">{plural(cycle.length, "file")} in loop</span>
                      </div>
                      <div className="cycle-chain-flow">
                        {cycle.map((file, fIdx) => (
                          <div key={file} className="cycle-step-chip">
                            {fIdx > 0 && (
                              <span className="cycle-arrow" style={{ display: "inline-flex", alignItems: "center" }}>
                                <ArrowRightLeft size={12} />
                              </span>
                            )}
                            <button
                              className="chip file-chip"
                              onClick={() => onOpenFile(file)}
                              title="Inspect file"
                            >
                              <code>{file.split("/").pop()}</code>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Network Canvas View */}
      {viewMode === "network" && (
        <div className="dep-canvas-wrapper">
          {/* Controls Bar */}
          <div className="dep-toolbar">
            <div className="toolbar-left">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search nodes by file path..."
                className="dep-search-clean"
              />

              <div className="filter-select-wrap">
                <span className="filter-lbl">MODULE:</span>
                <select
                  className="clean-select"
                  value={clusterFilter}
                  onChange={(e) => setClusterFilter(e.target.value)}
                >
                  <option value="all">All Modules ({analysis.clusters.length})</option>
                  {analysis.clusters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({plural(c.files, "file")})
                    </option>
                  ))}
                </select>
              </div>

              <button
                className={`btn toggle-pill-btn ${issuesOnly ? "active" : ""}`}
                onClick={() => setIssuesOnly((prev) => !prev)}
              >
                Issues Only ({analysis.nodes.filter((n) => n.issueCount > 0).length})
              </button>
            </div>

            <div className="toolbar-right">
              <button
                className="tool-btn"
                onClick={() => setZoom((z) => ({ ...z, k: Math.min(2.5, z.k + 0.2) }))}
                title="Zoom In"
              >
                +
              </button>
              <button
                className="tool-btn"
                onClick={() => setZoom((z) => ({ ...z, k: Math.max(0.4, z.k - 0.2) }))}
                title="Zoom Out"
              >
                -
              </button>
              <button
                className="tool-btn"
                onClick={() => setZoom({ k: 1, x: 0, y: 0 })}
                title="Reset View"
              >
                Reset
              </button>
            </div>
          </div>

          {/* SVG Canvas */}
          <div
            className="dep-canvas-viewport"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: "grab" }}
          >
            <svg ref={canvasRef} className="dep-svg-element" width="100%" height="100%">
              <defs>
                <marker
                  id="dep-arrow-default"
                  viewBox="0 0 10 10"
                  refX="14"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 2 L 7 5 L 0 8 z" fill="#30363D" />
                </marker>
                <marker
                  id="dep-arrow-active"
                  viewBox="0 0 10 10"
                  refX="14"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 2 L 7 5 L 0 8 z" fill="#E53935" />
                </marker>
              </defs>

              <g
                ref={viewportRef}
                transform={`translate(${zoom.x}, ${zoom.y}) scale(${zoom.k})`}
              >
                {/* Edges */}
                {visibleEdges.map((e) => {
                  const fromPos = positions.get(e.from);
                  const toPos = positions.get(e.to);
                  if (!fromPos || !toPos) return null;

                  const isEdgeHighlighted =
                    selectedNodeId && (e.from === selectedNodeId || e.to === selectedNodeId);

                  return (
                    <line
                      key={`${e.from}->${e.to}`}
                      x1={fromPos.x}
                      y1={fromPos.y}
                      x2={toPos.x}
                      y2={toPos.y}
                      stroke={isEdgeHighlighted ? "#E53935" : "#21262D"}
                      strokeWidth={isEdgeHighlighted ? 2.5 : 1}
                      markerEnd={isEdgeHighlighted ? "url(#dep-arrow-active)" : "url(#dep-arrow-default)"}
                    />
                  );
                })}

                {/* Nodes */}
                {filteredNodes.map((n) => {
                  const pos = positions.get(n.path);
                  if (!pos) return null;

                  const isSelected = selectedNodeId === n.path;
                  const isHovered = hovered === n.path;
                  const isConnected =
                    selectedNodeId &&
                    (adjacency.get(selectedNodeId)?.has(n.path) || adjacency.get(n.path)?.has(selectedNodeId));
                  const r = nodeRadius(n);
                  const color = colorByCluster.get(n.cluster) || "#2F81F7";

                  return (
                    <g
                      key={n.path}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectNode(isSelected ? null : n.path);
                      }}
                      onMouseEnter={() => setHovered(n.path)}
                      onMouseLeave={() => setHovered(null)}
                      style={{ cursor: "pointer" }}
                    >
                      <circle
                        r={isSelected ? r + 3 : r}
                        fill={isSelected ? "#E53935" : isConnected ? "#3FB950" : color}
                        stroke={isSelected ? "#FFFFFF" : n.issueCount > 0 ? "#F85149" : "#161B22"}
                        strokeWidth={isSelected ? 2.5 : n.issueCount > 0 ? 2 : 1.5}
                        filter={isSelected ? "drop-shadow(0 0 8px rgba(229, 57, 53, 0.7))" : undefined}
                      />

                      {(isSelected || isHovered || r > 11) && (
                        <text
                          y={r + 12}
                          textAnchor="middle"
                          fill="#F0F6FC"
                          fontSize="10"
                          fontFamily="JetBrains Mono, monospace"
                          className="node-label-txt"
                        >
                          {n.name}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Selected Node Floating Details Card */}
            {selectedNode && (
              <div className="node-floating-card-clean">
                <div className="float-head">
                  <Badge variant="accent">{selectedNode.language}</Badge>
                  <button className="float-close" onClick={() => onSelectNode(null)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <X size={14} />
                  </button>
                </div>
                <div className="float-title">{selectedNode.name}</div>
                <div className="float-path"><code>{selectedNode.path}</code></div>
                <div className="float-stats">
                  <span>{selectedNode.loc} LOC</span>
                  <span>{selectedNode.fanIn} callers</span>
                  <span>{selectedNode.fanOut} dependencies</span>
                </div>
                <button
                  className="btn primary btn-sm full-width"
                  onClick={() => onOpenFile(selectedNode.path)}
                >
                  Read Code in Explorer →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
