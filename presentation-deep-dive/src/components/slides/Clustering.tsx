import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

const KINDS = [
  {
    kind: "agreement",
    threshold: "cluster of size ≥ 2",
    mapping: "multiple authors raised the same claim",
    color: "var(--agreement)",
    edge: "solid green",
  },
  {
    kind: "contradict",
    threshold: "explicit opposition on subject X",
    mapping: "one author says A, another says ¬A, same topic",
    color: "var(--contradiction)",
    edge: "dashed red",
  },
  {
    kind: "related",
    threshold: "topical proximity, no direct opposition",
    mapping: "same theme, different angle",
    color: "var(--text-muted)",
    edge: "thin gray",
  },
];

export function Clustering({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Act 3 · How it connects
      </p>
      <h2 className="mb-2 text-center text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
        Three edge kinds, one LLM pass
      </h2>
      <p className="mb-10 max-w-3xl text-center text-sm text-[var(--text-secondary)]">
        No embeddings. No cosine similarity. No ANN index. The merger emits clusters and
        edges as structured JSON, the render layer visualizes them. Everything is string-
        string semantic judgment by a 4B-parameter model.
      </p>

      <div className="w-full max-w-5xl space-y-4">
        {KINDS.map((k, i) => (
          <motion.div
            key={k.kind}
            className="flex items-center gap-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4"
            initial={{ x: -12, opacity: 0 }}
            animate={isActive ? { x: 0, opacity: 1 } : { x: -12, opacity: 0 }}
            transition={{ duration: 0.35, delay: 0.2 + i * 0.12 }}
          >
            <div
              className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border bg-[var(--surface-elevated)]"
              style={{ borderColor: k.color }}
            >
              <svg width="50" height="20" viewBox="0 0 50 20">
                <circle cx="6" cy="10" r="3" fill={k.color} />
                <line
                  x1="12"
                  y1="10"
                  x2="38"
                  y2="10"
                  stroke={k.color}
                  strokeWidth="1.5"
                  strokeDasharray={k.kind === "contradict" ? "4 2" : k.kind === "related" ? "2 2" : "0"}
                  opacity={k.kind === "related" ? 0.5 : 1}
                />
                <circle cx="44" cy="10" r="3" fill={k.color} />
              </svg>
            </div>
            <div className="flex-1">
              <div className="mb-1 flex items-baseline gap-3">
                <code className="font-mono text-sm font-semibold" style={{ color: k.color }}>
                  {k.kind}
                </code>
                <span className="text-[11px] text-[var(--text-muted)]">
                  edge style: {k.edge}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">Trigger:</span>{" "}
                {k.threshold}
                {" · "}
                <span className="font-semibold text-[var(--text-primary)]">Meaning:</span>{" "}
                {k.mapping}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="mt-10 w-full max-w-5xl rounded-xl border border-[var(--warning)] bg-[color-mix(in_oklch,var(--warning)_12%,var(--background))] px-5 py-3"
        initial={{ opacity: 0 }}
        animate={isActive ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.8 }}
      >
        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--warning)]">Upstream ceiling.</span>{" "}
          Spec-synthesis.md R011 defers real retrieval (embeddings / cosine similarity) to
          a future version. For a POC with &lt;20 ideas this is fine. At 100+ ideas the
          merger's single-call pattern will break — context won't fit.
        </p>
      </motion.div>
    </motion.div>
  );
}
