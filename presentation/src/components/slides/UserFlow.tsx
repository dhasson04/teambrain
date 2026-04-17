import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { SlideProps } from "../StepIndicator";

const STEPS = [
  {
    label: "Set up project",
    detail: "Define the problem statement, drop in client briefs and prior context",
    artifact: "problem.md + materials/",
  },
  {
    label: "Drop meeting transcript",
    detail: "Paste a transcript or notes from the team meeting that kicked this off",
    artifact: "materials/meeting-2026-04-12.md",
  },
  {
    label: "Each teammate brain dumps",
    detail: "Open the My Dump tab, write freely about ideas, concerns, proposals",
    artifact: "dumps/<author>-<timestamp>.md",
  },
  {
    label: "Synthesize",
    detail: "Agent reads every dump, extracts ideas, builds the graph, writes synthesis",
    artifact: "ideas.json + synthesis/latest.md",
  },
];

export function UserFlow({ isActive }: SlideProps) {
  const [active, setActive] = useState(-1);

  useEffect(() => {
    if (!isActive) {
      setActive(-1);
      return;
    }
    const timers = STEPS.map((_, i) =>
      setTimeout(() => setActive(i), 400 + i * 700)
    );
    return () => timers.forEach(clearTimeout);
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
        User flow
      </p>
      <h2 className="mb-12 text-center text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
        From kickoff to synthesis
      </h2>

      <div className="relative flex w-full max-w-6xl items-stretch justify-between">
        <div className="absolute left-0 right-0 top-7 h-px bg-[var(--border)]" />
        <motion.div
          className="absolute left-0 top-7 h-px bg-[var(--accent)]"
          initial={{ width: 0 }}
          animate={{ width: `${((active + 1) / STEPS.length) * 100}%` }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        />

        {STEPS.map((s, i) => {
          const isLit = i <= active;
          return (
            <div key={s.label} className="relative flex w-1/4 flex-col items-center px-4">
              <motion.div
                className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border-2"
                animate={{
                  borderColor: isLit ? "var(--accent)" : "var(--border)",
                  backgroundColor: isLit ? "var(--accent-tint)" : "var(--surface)",
                }}
                transition={{ duration: 0.4 }}
              >
                <motion.span
                  className="font-mono text-base font-semibold"
                  animate={{ color: isLit ? "var(--accent)" : "var(--text-muted)" }}
                  transition={{ duration: 0.4 }}
                >
                  0{i + 1}
                </motion.span>
                {isLit && i === active && (
                  <span
                    className="pulse-ring absolute inset-[-6px] rounded-full border border-[var(--accent)]"
                    aria-hidden
                  />
                )}
              </motion.div>

              <motion.div
                className="mt-6 w-full rounded-xl border bg-[var(--surface)] p-4"
                animate={{
                  borderColor: isLit ? "var(--border-light)" : "var(--border)",
                  opacity: isLit ? 1 : 0.45,
                }}
                transition={{ duration: 0.4 }}
              >
                <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
                  {s.label}
                </h3>
                <p className="mb-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {s.detail}
                </p>
                <div className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5">
                  <code className="font-mono text-[10px] text-[var(--accent)]">
                    {s.artifact}
                  </code>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>

      <motion.p
        className="mt-12 text-sm text-[var(--text-muted)]"
        initial={{ opacity: 0 }}
        animate={active >= STEPS.length - 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        Step 4 reruns whenever any teammate adds or edits a dump
      </motion.p>
    </motion.div>
  );
}
