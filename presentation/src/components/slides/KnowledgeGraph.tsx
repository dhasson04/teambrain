import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { SlideProps } from "../StepIndicator";

interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
  authors: string[];
  type: "theme" | "claim" | "concern" | "deliverable";
  phase: number;
}

interface Edge {
  from: string;
  to: string;
  kind: "agree" | "contradict" | "related";
  phase: number;
}

const NODES: Node[] = [
  { id: "billing", label: "Billing too early", x: 220, y: 80, authors: ["A", "L", "B"], type: "theme", phase: 1 },
  { id: "value", label: "Show value first", x: 80, y: 200, authors: ["L", "A"], type: "claim", phase: 1 },
  { id: "step3", label: "Step 3 overload", x: 380, y: 200, authors: ["A", "B", "L"], type: "concern", phase: 2 },
  { id: "soft", label: "Soft / hard split", x: 540, y: 100, authors: ["L"], type: "deliverable", phase: 2 },
  { id: "free", label: "Freemium risk", x: 540, y: 280, authors: ["C"], type: "concern", phase: 3 },
  { id: "ab", label: "A/B test funnel", x: 700, y: 200, authors: ["A", "L", "B", "C"], type: "deliverable", phase: 4 },
];

const EDGES: Edge[] = [
  { from: "value", to: "billing", kind: "agree", phase: 2 },
  { from: "billing", to: "step3", kind: "agree", phase: 2 },
  { from: "step3", to: "soft", kind: "related", phase: 3 },
  { from: "soft", to: "free", kind: "contradict", phase: 3 },
  { from: "billing", to: "ab", kind: "related", phase: 4 },
  { from: "soft", to: "ab", kind: "agree", phase: 4 },
  { from: "free", to: "ab", kind: "agree", phase: 4 },
];

const TYPE_COLOR: Record<Node["type"], string> = {
  theme: "var(--info)",
  claim: "var(--accent)",
  concern: "var(--warning)",
  deliverable: "var(--accent-secondary)",
};

const EDGE_COLOR: Record<Edge["kind"], string> = {
  agree: "var(--agreement)",
  contradict: "var(--contradiction)",
  related: "var(--border-light)",
};

function nodeById(id: string) {
  return NODES.find((n) => n.id === id)!;
}

export function KnowledgeGraph({ isActive }: SlideProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setPhase(0);
      return;
    }
    const t = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 2800),
      setTimeout(() => setPhase(5), 3600),
    ];
    return () => t.forEach(clearTimeout);
  }, [isActive]);

  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Connections tab
      </p>
      <h2 className="mb-2 text-center text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
        Ideas as nodes, agreement as edges
      </h2>
      <p className="mb-8 max-w-2xl text-center text-base text-[var(--text-secondary)]">
        Force-directed graph capped at ~40 visible nodes. Click any node to see contributing
        dumps with author attribution and verbatim quotes.
      </p>

      <div className="w-full max-w-6xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <svg viewBox="0 0 800 360" className="w-full" style={{ maxHeight: "380px" }}>
          <defs>
            <marker id="kg-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <polygon points="0 0, 6 3, 0 6" fill="var(--text-muted)" />
            </marker>
          </defs>

          {EDGES.map((e, i) => {
            const src = nodeById(e.from);
            const tgt = nodeById(e.to);
            const visible = e.phase <= phase;
            return (
              <motion.line
                key={i}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={EDGE_COLOR[e.kind]}
                strokeWidth={e.kind === "contradict" ? 2 : 1.4}
                strokeDasharray={e.kind === "contradict" ? "6 4" : undefined}
                initial={{ opacity: 0 }}
                animate={{ opacity: visible ? 1 : 0 }}
                transition={{ duration: 0.5 }}
              />
            );
          })}

          {NODES.map((n) => {
            const visible = n.phase <= phase;
            const size = 20 + n.authors.length * 4;
            return (
              <motion.g
                key={n.id}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={visible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.4 }}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={size}
                  fill="var(--surface-elevated)"
                  stroke={TYPE_COLOR[n.type]}
                  strokeWidth={1.6}
                />
                <text
                  x={n.x}
                  y={n.y - 2}
                  textAnchor="middle"
                  fill="var(--text-primary)"
                  fontSize={11}
                  fontWeight={500}
                  fontFamily="Inter, system-ui"
                >
                  {n.label}
                </text>
                <g transform={`translate(${n.x - (n.authors.length * 7) / 2}, ${n.y + 8})`}>
                  {n.authors.map((a, i) => (
                    <g key={i} transform={`translate(${i * 7}, 0)`}>
                      <circle r={6} fill={TYPE_COLOR[n.type]} opacity={0.85} />
                      <text textAnchor="middle" y={2.5} fill="#fff" fontSize={7} fontWeight={600} fontFamily="Inter, system-ui">
                        {a}
                      </text>
                    </g>
                  ))}
                </g>
              </motion.g>
            );
          })}
        </svg>

        <div className="mt-4 flex items-center gap-6 border-t border-[var(--border)] pt-4 text-[11px]">
          <Legend color="var(--agreement)" label="agreement" />
          <Legend color="var(--contradiction)" label="contradiction" dashed />
          <Legend color="var(--border-light)" label="topical relation" />
          <span className="ml-auto text-[var(--text-muted)]">
            node size = # contributing dumps · color = idea type
          </span>
        </div>
      </div>

      <motion.p
        className="mt-6 max-w-3xl text-center text-sm text-[var(--text-muted)]"
        initial={{ opacity: 0 }}
        animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        Past ~40 visible nodes the layout becomes a hairball. Cap visible, cluster the rest,
        filter by author / type / recency.
      </motion.p>
    </motion.div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="22" height="6">
        <line x1="0" y1="3" x2="22" y2="3" stroke={color} strokeWidth="1.6" strokeDasharray={dashed ? "4 3" : undefined} />
      </svg>
      <span className="text-[var(--text-secondary)]">{label}</span>
    </div>
  );
}
