import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

export function Title({}: SlideProps) {
  return (
    <motion.div
      className="grid-bg flex h-full flex-col items-center justify-center px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border-light)] bg-[var(--surface-elevated)]"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
          <circle cx="8" cy="10" r="3" stroke="var(--accent)" strokeWidth="1.6" />
          <circle cx="24" cy="10" r="3" stroke="var(--contradiction)" strokeWidth="1.6" />
          <circle cx="16" cy="22" r="3" stroke="var(--warning)" strokeWidth="1.6" />
          <line x1="8" y1="10" x2="16" y2="22" stroke="var(--border-light)" strokeWidth="1.2" strokeDasharray="2 2" />
          <line x1="24" y1="10" x2="16" y2="22" stroke="var(--border-light)" strokeWidth="1.2" strokeDasharray="2 2" />
          <line x1="8" y1="10" x2="24" y2="10" stroke="var(--contradiction)" strokeWidth="1.4" />
        </svg>
      </motion.div>

      <motion.p
        className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--accent-secondary)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        Forensic deep dive · sibling to /teambrain
      </motion.p>

      <motion.h1
        className="mb-4 text-center text-7xl font-semibold tracking-tight text-[var(--text-primary)]"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        What Teambrain <em className="not-italic text-[var(--contradiction)]">actually</em> does
      </motion.h1>

      <motion.p
        className="mb-3 max-w-2xl text-center text-xl text-[var(--text-secondary)]"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.35 }}
      >
        End-to-end architecture, every prompt shown verbatim, real vault evidence
      </motion.p>

      <motion.p
        className="mb-12 max-w-2xl text-center text-base text-[var(--text-muted)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      >
        The pitch deck says "personal dumps → shared synthesis." This deck opens the hood
        and asks why the output on gemma3:4b was, in the author's words, shit.
      </motion.p>

      <motion.div
        className="flex items-center gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.65 }}
      >
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
          16 slides · 6 acts
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          arrow keys / space · press r to reset
        </span>
      </motion.div>

      <motion.p
        className="mt-20 text-xs uppercase tracking-widest text-[var(--text-muted)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.5, 1] }}
        transition={{ duration: 2, delay: 1, repeat: Infinity, repeatDelay: 2 }}
      >
        Press space or arrow right to begin
      </motion.p>
    </motion.div>
  );
}
