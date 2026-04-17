import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

export function GraphRender({ isActive }: SlideProps) {
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
        The knowledge graph, rendered
      </h2>
      <p className="mb-8 max-w-3xl text-center text-sm text-[var(--text-secondary)]">
        The Connections tab loads <code className="font-mono text-[var(--accent)]">ideas.json</code>{" "}
        and <code className="font-mono text-[var(--accent)]">connections.json</code>, runs
        d3-force until settled (~2s, then stops), caps at 40 visible nodes.
      </p>

      <motion.div
        className="grid w-full max-w-6xl gap-5 md:grid-cols-[1.4fr_1fr]"
        initial={{ y: 16, opacity: 0 }}
        animate={isActive ? { y: 0, opacity: 1 } : { y: 16, opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <div className="flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <svg width="320" height="220" viewBox="0 0 320 220">
            {/* Force-directed graph mock with 6 nodes and mixed edges */}
            <line x1="70" y1="60" x2="160" y2="110" stroke="var(--agreement)" strokeWidth="1.5" />
            <line x1="160" y1="110" x2="240" y2="60" stroke="var(--contradiction)" strokeWidth="1.5" strokeDasharray="4 3" />
            <line x1="70" y1="160" x2="160" y2="110" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
            <line x1="240" y1="160" x2="160" y2="110" stroke="var(--agreement)" strokeWidth="1.5" />
            <line x1="70" y1="60" x2="70" y2="160" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
            <circle cx="70" cy="60" r="12" fill="var(--accent)" />
            <circle cx="160" cy="110" r="14" fill="var(--accent-strong)" />
            <circle cx="240" cy="60" r="12" fill="var(--warning)" />
            <circle cx="70" cy="160" r="10" fill="var(--info)" />
            <circle cx="240" cy="160" r="10" fill="var(--info)" />
            <text x="70" y="44" textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontFamily="var(--font-mono)">
              billing@3
            </text>
            <text x="240" y="44" textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontFamily="var(--font-mono)">
              defer→5
            </text>
            <text x="160" y="138" textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontFamily="var(--font-mono)">
              split-funnel
            </text>
          </svg>
          <p className="text-center text-[11px] text-[var(--text-muted)]">
            node size = contributing dump count · color = type · edge style = relation kind
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]">
              UI affordances
            </p>
            <ul className="space-y-1.5 text-[11px] text-[var(--text-secondary)]">
              <li>Click node → side panel with verbatim quotes per contributing author</li>
              <li>Filter chips: by type (claim/concern/...) and by author</li>
              <li>40-node cap; overflow pill "+N more (hidden)"</li>
              <li>d3-force settles in ~2s then stops — no perpetual jitter</li>
            </ul>
          </div>
          <div className="rounded-xl border border-[var(--contradiction)] bg-[var(--accent-secondary-tint)] p-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--contradiction)]">
              Smoke-test reality
            </p>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
              The 2026-04-17 run produced 6 ideas and zero merger-assigned clusters. The
              Connections tab rendered only 1 node visibly ("Splitting fu..."). Force
              settled; graph was technically functional. But without clusters or edges, it
              didn't really show connections.
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
