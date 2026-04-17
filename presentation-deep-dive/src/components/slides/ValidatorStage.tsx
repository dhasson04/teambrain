import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

const RULES = [
  {
    label: "Parse",
    detail: "Regex /\\[([^,\\]]+),\\s*([A-Za-z0-9._-]+)\\]/g extracts every [author, dump-id] marker",
    file: "validator.ts:24",
  },
  {
    label: "Check dump exists",
    detail: "If not, try prefix-tolerance: cited id is a unique prefix of a real dump-id → normalize. If prefix is ambiguous → emit \"ambiguous prefix\" with candidates.",
    file: "validator.ts:89-108",
    tag: "backprop-2",
  },
  {
    label: "Check author",
    detail: "Accept either the profile UUID (legacy) OR the display_name resolved via loadProfiles().",
    file: "validator.ts:116-125",
    tag: "backprop-2",
  },
  {
    label: "Per-bullet enforcement",
    detail: "Every non-empty bullet line starting with \"- \" must carry at least one citation within 200 chars.",
    file: "validator.ts:131-146",
  },
  {
    label: "Repair or fail",
    detail: "Emit a numbered complaint list the renderer re-prompts with. Up to 2 retries; 3rd failure surfaces error to SSE.",
    file: "renderer.ts:64-100",
  },
];

export function ValidatorStage({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Act 2 · Stage 4 of 4 — Validate
      </p>
      <h2 className="mb-2 text-center text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
        Every citation, grounded
      </h2>
      <p className="mb-8 max-w-3xl text-center text-sm text-[var(--text-secondary)]">
        The validator is the only non-LLM stage in the pipeline. It refuses to write
        latest.md unless every citation maps to a real dump + author pair.
      </p>

      <div className="w-full max-w-4xl space-y-3">
        {RULES.map((r, i) => (
          <motion.div
            key={r.label}
            className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3"
            initial={{ x: -12, opacity: 0 }}
            animate={isActive ? { x: 0, opacity: 1 } : { x: -12, opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.15 + i * 0.08 }}
          >
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-light)] bg-[var(--surface-elevated)] font-mono text-[10px] text-[var(--accent)]">
              {i + 1}
            </div>
            <div className="flex-1">
              <div className="mb-0.5 flex items-center gap-2">
                <span className="font-semibold text-[var(--text-primary)]">{r.label}</span>
                {r.tag && (
                  <span className="rounded-full border border-[var(--accent-secondary)] bg-[var(--accent-secondary-tint)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--accent-secondary)]">
                    {r.tag}
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                {r.detail}
              </p>
            </div>
            <code className="mt-1 shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
              {r.file}
            </code>
          </motion.div>
        ))}
      </div>

      <motion.p
        className="mt-8 max-w-3xl text-center text-[11px] text-[var(--text-muted)]"
        initial={{ opacity: 0 }}
        animate={isActive ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.7 }}
      >
        Before backprop-2: "dump-id does not exist" on every retry with the same ID → 3/3
        fail → pipeline errors. Prefix tolerance turned that specific failure mode into a
        first-attempt success on the same prompt + model.
      </motion.p>
    </motion.div>
  );
}
