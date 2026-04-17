import { forceCollide, forceX, forceY } from "d3-force";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiClient,
  type AttributionEntry,
  type AttributionMap,
  type Connection,
  type ConnectionKind,
  type Idea,
  type IdeaType,
} from "../../lib/api";
import { Button } from "../ui/button";

// Each idea type maps to a CSS custom property that gets resolved to a
// concrete hex at runtime before handing it to the canvas renderer.
const TYPE_COLOR_VARS: Record<IdeaType, string> = {
  theme: "--info",
  claim: "--accent",
  concern: "--warning",
  deliverable: "--accent-secondary",
  proposal: "--accent-strong",
  question: "--text-muted",
};

const TYPE_COLORS: Record<IdeaType, string> = {
  theme: "var(--info)",
  claim: "var(--accent)",
  concern: "var(--warning)",
  deliverable: "var(--accent-secondary)",
  proposal: "var(--accent-strong)",
  question: "var(--text-muted)",
};

const KIND_COLOR_VARS: Record<ConnectionKind, string> = {
  agree: "--agreement",
  contradict: "--contradiction",
  related: "--border-light",
};

const KIND_WIDTH: Record<ConnectionKind, number> = {
  agree: 1.6,
  contradict: 2,
  related: 1.2,
};

const VISIBLE_CAP = 40;
const FALLBACK_COLOR = "#888888";

function hexToRgba(hex: string, alpha: number): string {
  // Accept both #rgb and #rrggbb; return transparent fallback if we can't parse.
  if (!hex || hex[0] !== "#") return `rgba(136, 136, 136, ${alpha})`;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hex.length === 4) {
    const a = hex[1] ?? "0";
    const b1 = hex[2] ?? "0";
    const c = hex[3] ?? "0";
    r = parseInt(a + a, 16);
    g = parseInt(b1 + b1, 16);
    b = parseInt(c + c, 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function resolveCssVar(name: string): string {
  if (typeof window === "undefined") return FALLBACK_COLOR;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || FALLBACK_COLOR;
}

interface GraphNode {
  id: string;
  idea: Idea;
  color: string;
  colorVar: string;
  clusterKey: string;
  size: number;
  index: number;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  kind: ConnectionKind;
  color: string;
  width: number;
  edgeId: string;
}

// Lazy import of the ForceGraph2D module so it doesn't bloat the main bundle
// and so we can give it a stable `window` reference. Vite resolves the dynamic
// import at runtime; we hold the component in state once resolved.
type ForceGraphModule = typeof import("react-force-graph-2d");
type ForceGraphComponent = ForceGraphModule["default"];

interface ConnectionsTabProps {
  project: string;
  sub: string;
}

export function ConnectionsTab({ project, sub }: ConnectionsTabProps) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [attribution, setAttribution] = useState<AttributionMap>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [authorFilter, setAuthorFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<IdeaType>>(new Set());
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [ForceGraph2D, setForceGraph2D] = useState<ForceGraphComponent | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 800, h: 520 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  // The ref type on ForceGraph2D is complex (see d.ts FCwithRef); we store as
  // any since we call .d3Force / .centerAt / .zoom / .refresh (the last not in
  // the public types but supported at runtime).
  const graphRef = useRef<any>(null);

  // --- Data fetching (unchanged from prior impl) -----------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      apiClient.getIdeas(project, sub).catch(() => ({ ideas: [] as Idea[] })),
      apiClient.getConnections(project, sub).catch(() => ({ connections: [] as Connection[] })),
      apiClient.getAttribution(project, sub).catch(() => ({} as AttributionMap)),
    ]).then(([i, c, a]) => {
      if (cancelled) return;
      setIdeas(i.ideas);
      setConnections(c.connections);
      setAttribution(a);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [project, sub]);

  // --- Lazy-load the force graph module --------------------------------------
  useEffect(() => {
    let cancelled = false;
    import("react-force-graph-2d").then((mod) => {
      if (cancelled) return;
      setForceGraph2D(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Container resize observation ------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          w: Math.max(1, Math.floor(entry.contentRect.width)),
          h: Math.max(1, Math.floor(entry.contentRect.height)),
        });
      }
    });
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // --- Filter bar state (same logic as prior impl) ---------------------------
  const allAuthors = useMemo(() => {
    const set = new Set<string>();
    for (const entries of Object.values(attribution)) {
      for (const e of entries) set.add(e.author);
    }
    return [...set].sort();
  }, [attribution]);

  const allTypes = useMemo(() => {
    const set = new Set<IdeaType>();
    for (const i of ideas) set.add(i.type);
    return [...set].sort();
  }, [ideas]);

  const filtered = useMemo(() => {
    let pool = ideas;
    if (typeFilter.size > 0) pool = pool.filter((i) => typeFilter.has(i.type));
    if (authorFilter.size > 0) {
      pool = pool.filter((i) => {
        const entries = attribution[i.idea_id] ?? [];
        return entries.some((e) => authorFilter.has(e.author));
      });
    }
    if (pool.length <= VISIBLE_CAP) return pool;
    const sorted = [...pool].sort((a, b) => b.contributing_dumps.length - a.contributing_dumps.length);
    return sorted.slice(0, VISIBLE_CAP);
  }, [ideas, attribution, authorFilter, typeFilter]);

  const visibleIds = useMemo(() => new Set(filtered.map((i) => i.idea_id)), [filtered]);
  const visibleConnections = useMemo(
    () => connections.filter((c) => visibleIds.has(c.from_idea) && visibleIds.has(c.to_idea)),
    [connections, visibleIds],
  );

  // --- Resolve CSS custom properties once per mount / theme change -----------
  const resolvedTypeColors = useMemo(() => {
    const out = {} as Record<IdeaType, string>;
    for (const key of Object.keys(TYPE_COLOR_VARS) as IdeaType[]) {
      out[key] = resolveCssVar(TYPE_COLOR_VARS[key]);
    }
    return out;
    // Re-resolve whenever the force graph loads, just in case the CSS wasn't
    // applied yet on the very first render.
  }, [ForceGraph2D]);

  const resolvedKindColors = useMemo(() => {
    const out = {} as Record<ConnectionKind, string>;
    for (const key of Object.keys(KIND_COLOR_VARS) as ConnectionKind[]) {
      out[key] = resolveCssVar(KIND_COLOR_VARS[key]);
    }
    return out;
  }, [ForceGraph2D]);

  const resolvedLabelColor = useMemo(() => resolveCssVar("--text-primary"), [ForceGraph2D]);

  // --- Build graph data ------------------------------------------------------
  const graphData = useMemo(() => {
    const nodes: GraphNode[] = filtered.map((idea, idx) => {
      // Group ideas by cluster_id when available, otherwise by type. This keeps
      // the visualization meaningful even on subprojects that haven't been
      // through the clustering pass yet.
      const clusterKey = idea.cluster_id ?? `type:${idea.type}`;
      return {
        id: idea.idea_id,
        idea,
        color: resolvedTypeColors[idea.type] || FALLBACK_COLOR,
        colorVar: TYPE_COLORS[idea.type],
        clusterKey,
        size: Math.min(14, 6 + idea.contributing_dumps.length * 0.8),
        index: idx,
      };
    });

    const links: GraphLink[] = visibleConnections.map((c) => ({
      source: c.from_idea,
      target: c.to_idea,
      kind: c.kind,
      color: resolvedKindColors[c.kind] || FALLBACK_COLOR,
      width: KIND_WIDTH[c.kind],
      edgeId: c.edge_id,
    }));

    return { nodes, links };
  }, [filtered, visibleConnections, resolvedTypeColors, resolvedKindColors]);

  // --- Cluster layout: distribute cluster centroids evenly on a ring ---------
  const clusterCenters = useMemo(() => {
    const keys = Array.from(new Set(graphData.nodes.map((n) => n.clusterKey)));
    const out = new Map<string, { x: number; y: number }>();
    if (keys.length === 0) return out;
    if (keys.length === 1) {
      const only = keys[0];
      if (only !== undefined) out.set(only, { x: 0, y: 0 });
      return out;
    }
    const radius = Math.min(160, 40 + keys.length * 22);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === undefined) continue;
      const angle = (i / keys.length) * Math.PI * 2 - Math.PI / 2;
      out.set(key, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
    return out;
  }, [graphData.nodes]);

  // --- Apply cluster-biased forces once the graph has mounted ----------------
  useEffect(() => {
    if (!graphRef.current) return;
    if (graphData.nodes.length === 0) return;
    const getCenter = (n: GraphNode) => clusterCenters.get(n.clusterKey) ?? { x: 0, y: 0 };
    graphRef.current.d3Force(
      "x",
      forceX<GraphNode>((n: GraphNode) => getCenter(n).x).strength(0.25),
    );
    graphRef.current.d3Force(
      "y",
      forceY<GraphNode>((n: GraphNode) => getCenter(n).y).strength(0.25),
    );
    const charge = graphRef.current.d3Force("charge");
    if (charge && typeof charge.strength === "function") charge.strength(-120);
    graphRef.current.d3Force("collide", forceCollide(28));
    // Zoom to fit after the simulation settles a bit.
    const t = setTimeout(() => {
      if (graphRef.current) graphRef.current.zoomToFit(800, 60);
    }, 1200);
    return () => clearTimeout(t);
  }, [graphData.nodes, clusterCenters]);

  // --- Breathing-pulse RAF loop ----------------------------------------------
  useEffect(() => {
    if (!ForceGraph2D) return;
    const interval = setInterval(() => {
      if (graphRef.current && typeof graphRef.current.refresh === "function") {
        graphRef.current.refresh();
      }
    }, 33);
    return () => clearInterval(interval);
  }, [ForceGraph2D]);

  // --- Hover -> neighbor set (for dim / scale) -------------------------------
  const connectedNodes = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const set = new Set<string>();
    set.add(hoveredNode);
    for (const link of graphData.links) {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      if (src === hoveredNode) set.add(tgt as string);
      if (tgt === hoveredNode) set.add(src as string);
    }
    return set;
  }, [hoveredNode, graphData.links]);

  // --- Selection details -----------------------------------------------------
  const hiddenCount = ideas.length - filtered.length;
  const selectedIdea = ideas.find((i) => i.idea_id === selected);
  const selectedAttr: AttributionEntry[] = selectedIdea ? attribution[selectedIdea.idea_id] ?? [] : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Filters
        </span>
        {allTypes.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={typeFilter.has(t) ? "primary" : "secondary"}
            onClick={() => {
              const next = new Set(typeFilter);
              if (next.has(t)) next.delete(t);
              else next.add(t);
              setTypeFilter(next);
            }}
          >
            {t}
          </Button>
        ))}
        <span className="mx-2 h-4 w-px bg-[var(--border)]" />
        {allAuthors.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={authorFilter.has(a) ? "primary" : "secondary"}
            onClick={() => {
              const next = new Set(authorFilter);
              if (next.has(a)) next.delete(a);
              else next.add(a);
              setAuthorFilter(next);
            }}
          >
            {a}
          </Button>
        ))}
        {hiddenCount > 0 && (
          <span className="ml-auto rounded-full bg-[var(--surface-elevated)] px-2 py-1 text-[10px] text-[var(--text-muted)]">
            +{hiddenCount} more (hidden by 40-node cap)
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <div
          ref={containerRef}
          className="relative h-[520px] overflow-hidden rounded-xl border border-[var(--border)]"
          style={{
            background: `
              radial-gradient(ellipse at 25% 40%, rgba(167, 139, 250, 0.05), transparent 55%),
              radial-gradient(ellipse at 75% 30%, rgba(106, 141, 184, 0.05), transparent 55%),
              radial-gradient(ellipse at 30% 75%, rgba(106, 155, 122, 0.04), transparent 55%),
              radial-gradient(ellipse at 75% 70%, rgba(212, 167, 106, 0.04), transparent 55%),
              var(--background)
            `,
          }}
        >
          {loading ? (
            <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
              loading…
            </div>
          ) : ideas.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div>
                <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">No ideas yet</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Run synthesis to populate this view. Check the Synthesis tab or use the
                  Re-synthesize button (T014).
                </p>
              </div>
            </div>
          ) : !ForceGraph2D ? (
            <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
              preparing visualization…
            </div>
          ) : (
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              width={containerSize.w}
              height={containerSize.h}
              backgroundColor="rgba(0,0,0,0)"
              nodeId="id"
              cooldownTicks={120}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.32}
              linkColor={(link: GraphLink) => {
                const src = typeof link.source === "object" ? (link.source as GraphNode).id : link.source;
                const tgt = typeof link.target === "object" ? (link.target as GraphNode).id : link.target;
                const touched = hoveredNode && (src === hoveredNode || tgt === hoveredNode);
                const dimmed = hoveredNode && !touched;
                return hexToRgba(link.color, dimmed ? 0.08 : 0.55);
              }}
              linkWidth={(link: GraphLink) => link.width}
              linkLineDash={(link: GraphLink) => (link.kind === "contradict" ? [6, 4] : null)}
              linkDirectionalParticles={(link: GraphLink) => (link.kind === "agree" ? 3 : 0)}
              linkDirectionalParticleSpeed={() => 0.004}
              linkDirectionalParticleWidth={() => 2}
              linkDirectionalParticleColor={(link: GraphLink) => {
                const src = link.source;
                if (typeof src === "object") return (src as GraphNode).color;
                const node = graphData.nodes.find((n) => n.id === src);
                return node ? node.color : link.color;
              }}
              nodeCanvasObject={(rawNode, ctx, globalScale) => {
                const node = rawNode as GraphNode;
                if (node.x == null || node.y == null) return;
                const baseSize = node.size / globalScale;
                const isHovered = hoveredNode === node.id;
                const isConnected = hoveredNode != null && connectedNodes.has(node.id);
                const isDimmed = hoveredNode != null && !isConnected;
                const alpha = isDimmed ? 0.15 : 1;
                const hoverScale = isHovered ? 1.4 : isConnected ? 1.1 : 1;
                const r = baseSize * hoverScale;

                // Outer radial glow (3x node radius)
                const glowSize = r * 3;
                try {
                  const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowSize);
                  gradient.addColorStop(0, hexToRgba(node.color, 0.3 * alpha));
                  gradient.addColorStop(0.5, hexToRgba(node.color, 0.08 * alpha));
                  gradient.addColorStop(1, "rgba(0,0,0,0)");
                  ctx.fillStyle = gradient;
                  ctx.fillRect(node.x - glowSize, node.y - glowSize, glowSize * 2, glowSize * 2);
                } catch {
                  /* gradient fallback: skip glow */
                }

                // Breathing pulse
                const pulse = 1 + 0.06 * Math.sin(Date.now() / 800 + node.index);
                const finalR = r * pulse;

                // Main filled circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, finalR, 0, 2 * Math.PI);
                ctx.fillStyle = hexToRgba(node.color, 0.7 * alpha);
                ctx.fill();

                // Selection ring
                if (selected === node.id) {
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, finalR + 3 / globalScale, 0, 2 * Math.PI);
                  ctx.strokeStyle = hexToRgba(node.color, 0.9 * alpha);
                  ctx.lineWidth = 1.5 / globalScale;
                  ctx.stroke();
                }

                // Inner bright core (40% radius, white at 30% alpha)
                ctx.beginPath();
                ctx.arc(node.x, node.y, finalR * 0.4, 0, 2 * Math.PI);
                ctx.fillStyle = hexToRgba("#ffffff", 0.3 * alpha);
                ctx.fill();

                // Label below the node — truncate long statements
                const fontSize = Math.max(10 / globalScale, 3);
                ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillStyle = hexToRgba(resolvedLabelColor, 0.8 * alpha);
                const label = node.idea.statement.length > 42
                  ? node.idea.statement.slice(0, 40) + "…"
                  : node.idea.statement;
                ctx.fillText(label, node.x, node.y + finalR + 4 / globalScale);
              }}
              nodePointerAreaPaint={(rawNode, color, ctx) => {
                const node = rawNode as GraphNode;
                if (node.x == null || node.y == null) return;
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.size * 1.6, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
              }}
              onNodeHover={(node) => {
                setHoveredNode(node ? String((node as GraphNode).id) : null);
              }}
              onNodeClick={(node) => {
                const n = node as GraphNode;
                setSelected(n.id);
                if (graphRef.current && n.x != null && n.y != null) {
                  graphRef.current.centerAt(n.x, n.y, 800);
                  graphRef.current.zoom(2.5, 800);
                }
              }}
              onBackgroundClick={() => {
                setSelected(null);
                if (graphRef.current) {
                  graphRef.current.centerAt(0, 0, 800);
                  graphRef.current.zoom(1, 800);
                }
              }}
            />
          )}
        </div>

        <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Idea details
          </p>
          {selectedIdea ? (
            <>
              <p className="mb-3 text-sm font-medium text-[var(--text-primary)]">
                {selectedIdea.statement}
              </p>
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider text-white"
                  style={{ background: TYPE_COLORS[selectedIdea.type] }}
                >
                  {selectedIdea.type}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {selectedAttr.length} contributor{selectedAttr.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="space-y-2">
                {selectedAttr.map((entry, i) => (
                  <div
                    key={i}
                    className="rounded-md border-l border-[var(--border-light)] bg-[var(--background)] py-1.5 pl-3 pr-2"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {entry.author}
                    </p>
                    <p className="mt-1 text-xs italic leading-relaxed text-[var(--text-secondary)]">
                      &ldquo;{entry.verbatim_quote}&rdquo;
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">{entry.dump_id}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              Click a node to see contributing dumps with verbatim quotes.
            </p>
          )}

          <div className="mt-4 border-t border-[var(--border)] pt-3 text-[10px] text-[var(--text-muted)]">
            <div className="mb-1 flex items-center gap-2">
              <svg width="20" height="6">
                <line x1="0" y1="3" x2="20" y2="3" stroke="var(--agreement)" strokeWidth="1.6" />
              </svg>
              agreement
            </div>
            <div className="mb-1 flex items-center gap-2">
              <svg width="20" height="6">
                <line
                  x1="0"
                  y1="3"
                  x2="20"
                  y2="3"
                  stroke="var(--contradiction)"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
              </svg>
              contradiction
            </div>
            <div className="flex items-center gap-2">
              <svg width="20" height="6">
                <line x1="0" y1="3" x2="20" y2="3" stroke="var(--border-light)" strokeWidth="1.2" />
              </svg>
              topical relation
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
