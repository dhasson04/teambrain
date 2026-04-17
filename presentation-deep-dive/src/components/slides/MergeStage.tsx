import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

// Real MergeResponseSchema shape from app/src/inference/merger.ts:15-47
const SCHEMA = `MergeResponseSchema = {
  clusters: [
    { cluster_id, member_idea_ids: string[] }
  ],
  contradictions: [
    { left_idea_id, right_idea_id, reason }
  ],
  edges: [
    { from, to, kind: "agree"|"contradict"|"related", weight: 0..1 }
  ]
}`;

// Real extract from app/vault/.../ideas.json — Bob's dump's extracted ideas
const REAL_CLUSTER_EXCERPT = `[
  "6827d9fc-...-i0 — Splitting funnels with feature flags... two days behind one prod gate",
  "6827d9fc-...-i1 — The credit-card form is a potential barrier to conversion",
  "6827d9fc-...-i2 — Cohort comparisons are biased; a proper A/B test is needed",
  "6827d9fc-...-i3 — Dan's input is needed before deciding on small-business cohort",
  "1cea426c-...-i0 — Delaying billing to step 3 resolves a funnel breakage",
  "e1adf205-...-i0 — Deferring billing to step 5 risks freemium contamination"
]`;

export function MergeStage({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Act 2 · Stage 2 of 4 — Merge
      </p>
      <h2 className="mb-2 text-center text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
        One LLM pass over all ideas
      </h2>
      <p className="mb-8 max-w-3xl text-center text-sm text-[var(--text-secondary)]">
        The merger takes every extracted idea across every dump and asks the model to group
        them into clusters and flag explicit contradictions. One call, not per-pair.
      </p>

      <div className="grid w-full max-w-6xl gap-5 md:grid-cols-2">
        <motion.div
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          initial={{ x: -16, opacity: 0 }}
          animate={isActive ? { x: 0, opacity: 1 } : { x: -16, opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]">
              Zod schema the merger enforces
            </p>
            <code className="font-mono text-[10px] text-[var(--text-muted)]">
              merger.ts:15-47
            </code>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {SCHEMA}
          </pre>
          <div className="mt-4 space-y-2 text-[11px] text-[var(--text-muted)]">
            <div>
              <span className="font-semibold text-[var(--agreement)]">clusters</span> —
              cluster of size ≥ 2 = agreement signal
            </div>
            <div>
              <span className="font-semibold text-[var(--contradiction)]">contradictions</span>
              {" — "}
              must have a reason; "covers different topics" is not enough
            </div>
            <div>
              <span className="font-semibold text-[var(--info)]">edges</span> — typed
              pairwise relations backing the knowledge graph
            </div>
          </div>
        </motion.div>

        <motion.div
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          initial={{ x: 16, opacity: 0 }}
          animate={isActive ? { x: 0, opacity: 1 } : { x: 16, opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--info)]">
              Input to the merge call (real, 2026-04-17 run)
            </p>
            <code className="font-mono text-[10px] text-[var(--text-muted)]">
              6 ideas × 3 dumps
            </code>
          </div>
          <pre className="max-h-[18rem] overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">
            {REAL_CLUSTER_EXCERPT}
          </pre>
          <div className="mt-4 rounded-md border border-[var(--contradiction)] bg-[var(--accent-secondary-tint)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--contradiction)]">Observation.</span>{" "}
            "Delay billing to step 3" and "Defer to step 5 risks freemium" are a real
            contradiction — same subject, explicit opposition. In the 2026-04-17 run the
            merger produced <span className="font-mono">cluster_id: null</span> for all six
            ideas. No cluster, no contradiction. One pass, on 4B params.
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
