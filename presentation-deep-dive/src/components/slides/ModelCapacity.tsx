import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

const MODELS = [
  {
    name: "gemma3:4b",
    params: "~4.3B",
    quant: "Q4_K_M (~2.6 GB)",
    verbatim: "partial",
    structural: "partial",
    json: "good",
    verdict: "What we're running. Recall catastrophe on verbatim grounding pre-backprop.",
    bg: "var(--accent-secondary-tint)",
    border: "var(--contradiction)",
  },
  {
    name: "gemma3:12b",
    params: "~12.2B",
    quant: "Q4_K_M (~7.3 GB)",
    verbatim: "solid",
    structural: "solid",
    json: "good",
    verdict: "Doesn't fit in 6 GB VRAM. Would fix prompt adherence + recall, costs a bigger GPU.",
    bg: "color-mix(in oklch, var(--warning) 8%, var(--background))",
    border: "var(--warning)",
  },
  {
    name: "claude-sonnet-4-6",
    params: "closed, large",
    quant: "remote API",
    verbatim: "reliable",
    structural: "reliable",
    json: "reliable",
    verdict: "Contradicts local-first positioning. ~$3/$15 per 1M tok — fine for a demo, not for always-on team use.",
    bg: "color-mix(in oklch, var(--info) 8%, var(--background))",
    border: "var(--info)",
  },
];

export function ModelCapacity({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Act 5 · Model capacity
      </p>
      <h2 className="mb-2 text-center text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
        What 4B can and can't do
      </h2>
      <p className="mb-8 max-w-3xl text-center text-sm text-[var(--text-secondary)]">
        Three capabilities matter for this pipeline: (1) echoing verbatim substrings from a
        prompt, (2) following structural constraints like "exactly three sections named X,
        Y, Z", (3) emitting valid JSON. Small models fail most at the first two.
      </p>

      <div className="grid w-full max-w-6xl gap-5 md:grid-cols-3">
        {MODELS.map((m, i) => (
          <motion.div
            key={m.name}
            className="rounded-xl border p-5"
            style={{ background: m.bg, borderColor: m.border }}
            initial={{ y: 16, opacity: 0 }}
            animate={isActive ? { y: 0, opacity: 1 } : { y: 16, opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.2 + i * 0.12 }}
          >
            <div className="mb-3 flex items-baseline justify-between">
              <code
                className="font-mono text-base font-semibold"
                style={{ color: m.border }}
              >
                {m.name}
              </code>
              <span className="text-[10px] text-[var(--text-muted)]">{m.params}</span>
            </div>
            <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1">
              <code className="font-mono text-[10px] text-[var(--text-secondary)]">
                {m.quant}
              </code>
            </div>
            <div className="mb-4 space-y-1.5 text-[11px] text-[var(--text-secondary)]">
              <div className="flex justify-between">
                <span>verbatim echo</span>
                <span className="font-mono text-[var(--text-primary)]">{m.verbatim}</span>
              </div>
              <div className="flex justify-between">
                <span>structural adherence</span>
                <span className="font-mono text-[var(--text-primary)]">{m.structural}</span>
              </div>
              <div className="flex justify-between">
                <span>strict JSON</span>
                <span className="font-mono text-[var(--text-primary)]">{m.json}</span>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {m.verdict}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.p
        className="mt-8 max-w-4xl text-center text-[11px] text-[var(--text-muted)]"
        initial={{ opacity: 0 }}
        animate={isActive ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.7 }}
      >
        Why verbatim is hard at 4B: Q4_K_M quantization normalizes whitespace and
        smart-quotes when echoing text. The fuzzy-match fix in backprop-1 works around
        this instead of trying to lift the model's grounding quality.
      </motion.p>
    </motion.div>
  );
}
