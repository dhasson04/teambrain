import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  Position,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
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

const TYPE_COLORS: Record<IdeaType, string> = {
  theme: "var(--info)",
  claim: "var(--accent)",
  concern: "var(--warning)",
  deliverable: "var(--accent-secondary)",
  proposal: "var(--accent-strong)",
  question: "var(--text-muted)",
};

const KIND_STYLE: Record<ConnectionKind, { color: string; dash?: string; width: number }> = {
  agree: { color: "var(--agreement)", width: 1.6 },
  contradict: { color: "var(--contradiction)", dash: "6 4", width: 2 },
  related: { color: "var(--border-light)", width: 1.2 },
};

const VISIBLE_CAP = 40;

interface IdeaNodeData {
  idea: Idea;
  authors: string[];
  selected: boolean;
  onClick: (id: string) => void;
}

function IdeaNode({ data }: NodeProps<IdeaNodeData>) {
  const color = TYPE_COLORS[data.idea.type];
  const size = Math.min(60, 22 + data.idea.contributing_dumps.length * 4);
  return (
    <div
      onClick={() => data.onClick(data.idea.idea_id)}
      className="cursor-pointer"
      style={{
        width: size * 2 + 80,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className="flex items-center gap-2 rounded-full border bg-[var(--surface-elevated)] px-3 py-1.5 transition-shadow"
        style={{
          borderColor: data.selected ? "var(--accent)" : color,
          borderWidth: data.selected ? 2 : 1.4,
          boxShadow: data.selected ? "0 0 0 3px var(--accent-tint)" : "none",
        }}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="truncate text-xs font-medium text-[var(--text-primary)]" title={data.idea.statement}>
          {data.idea.statement}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
          {data.authors.length}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { idea: IdeaNode };

interface ConnectionsTabProps {
  project: string;
  sub: string;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
}

function runForce(ideas: Idea[], connections: Connection[], width: number, height: number): Map<string, { x: number; y: number }> {
  const nodes: SimNode[] = ideas.map((i) => ({ id: i.idea_id }));
  const links: SimulationLinkDatum<SimNode>[] = connections
    .filter((c) => c.kind !== "contradict")
    .map((c) => ({ source: c.from_idea, target: c.to_idea }));
  const sim = forceSimulation(nodes)
    .force("charge", forceManyBody().strength(-300))
    .force("link", forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id((n) => n.id).distance(120))
    .force("center", forceCenter(width / 2, height / 2))
    .force("collide", forceCollide(60))
    .stop();
  for (let i = 0; i < 250; i++) sim.tick();
  const out = new Map<string, { x: number; y: number }>();
  for (const n of nodes) out.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
  return out;
}

export function ConnectionsTab({ project, sub }: ConnectionsTabProps) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [attribution, setAttribution] = useState<AttributionMap>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [authorFilter, setAuthorFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<IdeaType>>(new Set());
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  const positions = useMemo(() => {
    if (filtered.length === 0) return new Map<string, { x: number; y: number }>();
    const w = containerRef.current?.clientWidth ?? 800;
    const h = containerRef.current?.clientHeight ?? 500;
    return runForce(filtered, visibleConnections, w, h);
  }, [filtered, visibleConnections]);

  const rfNodes: Node<IdeaNodeData>[] = useMemo(() => {
    return filtered.map((idea) => {
      const pos = positions.get(idea.idea_id) ?? { x: 0, y: 0 };
      const authors = (attribution[idea.idea_id] ?? []).map((e) => e.author);
      return {
        id: idea.idea_id,
        type: "idea",
        position: pos,
        data: { idea, authors, selected: selected === idea.idea_id, onClick: setSelected },
        draggable: true,
      };
    });
  }, [filtered, positions, attribution, selected]);

  const rfEdges: Edge[] = useMemo(() => {
    return visibleConnections.map((c) => {
      const style = KIND_STYLE[c.kind];
      return {
        id: c.edge_id,
        source: c.from_idea,
        target: c.to_idea,
        style: { stroke: style.color, strokeWidth: style.width, strokeDasharray: style.dash },
        type: "default",
      };
    });
  }, [visibleConnections]);

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
          className="relative h-[520px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)]"
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
          ) : (
            <ReactFlowProvider>
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={NODE_TYPES}
                fitView
                proOptions={{ hideAttribution: true }}
                nodesDraggable
                edgesFocusable={false}
                nodesConnectable={false}
              >
                <Background color="var(--border)" gap={24} size={1} />
                <Controls
                  className="!bg-[var(--surface)] !border-[var(--border)]"
                  showInteractive={false}
                />
              </ReactFlow>
            </ReactFlowProvider>
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
                  <div key={i} className="rounded-md border-l border-[var(--border-light)] bg-[var(--background)] py-1.5 pl-3 pr-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {entry.author}
                    </p>
                    <p className="mt-1 text-xs italic leading-relaxed text-[var(--text-secondary)]">
                      "{entry.verbatim_quote}"
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
                <line x1="0" y1="3" x2="20" y2="3" stroke="var(--contradiction)" strokeWidth="2" strokeDasharray="4 3" />
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
