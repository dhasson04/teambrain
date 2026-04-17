import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

const ROWS = [
  {
    promise: "Each dump yields a structured list of ideas",
    actual: "Bob: 0 ideas · Carol: 0 ideas · Alice: 1 trivial aside",
    verdict: "0 of 3 main claims survived extract",
    cause: "strict byte-exact verbatim_quote match (pre-backprop-1)",
  },
  {
    promise: "Renderer produces \"## Agreed / ## Disputed / ## Move forward\"",
    actual: "Model emitted \"## Agreed / ## Concerns\" — 2 of 3 sections, wrong names",
    verdict: "structural prompt partially followed",
    cause: "prompt adherence drops at 4B params under JSON+structure load",
  },
  {
    promise: "Citations validated verbatim against dump-ids",
    actual: "Model cited profile UUID (prefix of real dump-id); validator rejected 3/3 attempts with identical complaint; pipeline errored",
    verdict: "0 rendered outputs saved (pre-backprop-2)",
    cause: "renderer JSON had author + dump_id both UUID-shaped; model picked shorter one",
  },
  {
    promise: "SSE phase label cycles extracting → merging → rendering",
    actual: "UI label stuck on \"extracting…\" for the whole 3-4 min run",
    verdict: "backend events never reached browser in real time",
    cause: "Vite dev proxy byte-buffered the /api SSE stream",
  },
];

export function FailureModes({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8 py-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Act 5 · Why the output is poor
      </p>
      <h2 className="mb-2 text-center text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
        Promise vs. reality (2026-04-17 smoke test)
      </h2>
      <p className="mb-6 max-w-3xl text-center text-sm text-[var(--text-secondary)]">
        Numbers, not vibes. Every row traces to a JSONL log line or a saved artifact.
      </p>

      <div className="w-full max-w-6xl space-y-2.5">
        <div className="grid grid-cols-[1.3fr_1.3fr_0.8fr_1fr] gap-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          <div>What the spec / prompt promised</div>
          <div>What the model did on gemma3:4b</div>
          <div>Verdict</div>
          <div>Root cause</div>
        </div>
        {ROWS.map((r, i) => (
          <motion.div
            key={r.promise}
            className="grid grid-cols-[1.3fr_1.3fr_0.8fr_1fr] items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3"
            initial={{ y: 10, opacity: 0 }}
            animate={isActive ? { y: 0, opacity: 1 } : { y: 10, opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.18 + i * 0.08 }}
          >
            <p className="text-[11px] leading-relaxed text-[var(--agreement)]">{r.promise}</p>
            <p className="text-[11px] leading-relaxed text-[var(--contradiction)]">
              {r.actual}
            </p>
            <p className="text-[11px] font-semibold leading-relaxed text-[var(--text-primary)]">
              {r.verdict}
            </p>
            <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">{r.cause}</p>
          </motion.div>
        ))}
      </div>

      <motion.p
        className="mt-6 max-w-3xl text-center text-[11px] text-[var(--text-muted)]"
        initial={{ opacity: 0 }}
        animate={isActive ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.8 }}
      >
        Four of these are now fixed. The "## Concerns vs ## Disputed" drift is open —
        prompt adherence on 4B is genuinely a ceiling, not a bug.
      </motion.p>
    </motion.div>
  );
}
