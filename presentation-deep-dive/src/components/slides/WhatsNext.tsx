import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

const OPEN_ITEMS = [
  {
    rank: 1,
    title: "Wire materials + problem.md into the synthesis prompt",
    why: "Act 4's finding. Users pasting meeting transcripts expect the model to know about them. Currently it literally doesn't.",
    effort: "~S",
    lever: "High — restores advertised behavior",
  },
  {
    rank: 2,
    title: "Upgrade the model or offer gemma3:12b as an opt-in",
    why: "Recall, prompt adherence, and cluster quality all improve at 12B. A1000 6GB can't host it — needs a bigger GPU or external host.",
    effort: "~M (infra)",
    lever: "High — lifts the whole pipeline",
  },
  {
    rank: 3,
    title: "Fix prompt adherence: \"## Disputed\" instead of \"## Concerns\"",
    why: "Even after backprop, the 4B model renames the middle section. Fixable with few-shot examples in the prompt or a post-render section-header normalizer.",
    effort: "~S",
    lever: "Medium — cosmetic but trust-eroding",
  },
  {
    rank: 4,
    title: "Add real retrieval (embeddings + cosine) for >20 ideas",
    why: "Current merger packs every idea into one LLM call. At 50+ ideas this will OOM the context window. Spec-synthesis R011 deferred this.",
    effort: "~L",
    lever: "Low for POC, High once team size grows",
  },
  {
    rank: 5,
    title: "Move synthesis to a job queue with persistence",
    why: "Today synthesis holds an SSE connection for 3-4 minutes. Fine for one user, breaks for parallel teams. Needed before multi-subproject concurrency.",
    effort: "~M",
    lever: "Low for POC",
  },
];

export function WhatsNext({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8 py-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Act 6 · What's still broken
      </p>
      <h2 className="mb-2 text-center text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
        Ranked by quality lever
      </h2>
      <p className="mb-6 max-w-3xl text-center text-sm text-[var(--text-secondary)]">
        After the backprop batch, these are the remaining gaps. Ordered by impact on output
        quality, not effort.
      </p>

      <div className="w-full max-w-5xl space-y-2.5">
        {OPEN_ITEMS.map((item, i) => (
          <motion.div
            key={item.rank}
            className="grid grid-cols-[auto_1fr_auto_auto] items-start gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
            initial={{ x: -10, opacity: 0 }}
            animate={isActive ? { x: 0, opacity: 1 } : { x: -10, opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.2 + i * 0.08 }}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-light)] bg-[var(--surface-elevated)] font-mono text-[12px] font-semibold text-[var(--accent)]">
              {item.rank}
            </div>
            <div>
              <p className="mb-1 text-[12px] font-semibold text-[var(--text-primary)]">
                {item.title}
              </p>
              <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                {item.why}
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-center">
              <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                effort
              </p>
              <p className="font-mono text-[11px] text-[var(--text-primary)]">{item.effort}</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-center">
              <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                lever
              </p>
              <p className="font-mono text-[11px] text-[var(--accent)]">{item.lever}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.p
        className="mt-6 text-center text-[11px] text-[var(--text-muted)]"
        initial={{ opacity: 0 }}
        animate={isActive ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.9 }}
      >
        The shortest path from "POC output was shit" to "synthesis is actually useful" is
        #1 + #3. Model upgrade (#2) is the multiplier under everything else.
      </motion.p>
    </motion.div>
  );
}
