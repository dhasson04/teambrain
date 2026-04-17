import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

const README_CLAIM = `Given a project's <problem> statement, optional <materials>
(meeting transcripts, briefs, prior notes), and a set of <dumps>
(one per teammate, with author attribution), produce structured
output...`;

export function MaterialsAndProblemClaim({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Act 1 · What the prompt claims
      </p>
      <h2 className="mb-3 text-center text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
        Problem + materials + dumps, "synthesized together"
      </h2>
      <p className="mb-10 max-w-3xl text-center text-base text-[var(--text-secondary)]">
        The shipped synthesis prompt at{" "}
        <code className="font-mono text-[var(--accent)]">prompts/synthesis.md</code>{" "}
        describes the inputs like this. Hold onto it — we'll come back to it in Act 4.
      </p>

      <motion.div
        className="w-full max-w-4xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        initial={{ y: 16, opacity: 0 }}
        animate={isActive ? { y: 0, opacity: 1 } : { y: 16, opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--info)]">
            prompts/synthesis.md · Task section (verbatim)
          </p>
          <code className="font-mono text-[10px] text-[var(--text-muted)]">line 22-28</code>
        </div>
        <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {README_CLAIM}
        </pre>
      </motion.div>

      <motion.div
        className="mt-8 flex w-full max-w-4xl items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-5 py-3"
        initial={{ opacity: 0 }}
        animate={isActive ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <div className="text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">What we'd expect</span>
          {" — "}
          the materials tab should do meaningful work.
        </div>
        <div className="flex items-center gap-1.5 text-[var(--accent-secondary)]">
          <span className="pulse-ring h-1.5 w-1.5 rounded-full bg-[var(--accent-secondary)]" />
          <span className="text-[11px] uppercase tracking-wider">
            act 4 has something to say
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
