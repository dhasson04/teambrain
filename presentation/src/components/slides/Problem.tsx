import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { SlideProps } from "../StepIndicator";

const PEOPLE = [
  { name: "Alice", thought: "We should focus on retention" },
  { name: "Bob", thought: "Pricing is the real bottleneck" },
  { name: "Carol", thought: "Onboarding flow has friction" },
  { name: "Dan", thought: "Maybe we pivot the segment?" },
];

export function Problem({ isActive }: SlideProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setPhase(0);
      return;
    }
    const t = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 2600),
    ];
    return () => t.forEach(clearTimeout);
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
        The problem
      </p>
      <h2 className="mb-3 text-center text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
        AI made thinking individual
      </h2>
      <p className="mb-12 max-w-2xl text-center text-base text-[var(--text-secondary)]">
        Every teammate now has their own private dialogue with an AI. The team gets fragments,
        never the whole picture.
      </p>

      <div className="flex w-full max-w-5xl items-center justify-center gap-8">
        <div className="grid grid-cols-2 gap-4">
          {PEOPLE.map((p, i) => (
            <motion.div
              key={p.name}
              className="w-64 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
              initial={{ opacity: 0, y: 12 }}
              animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
              transition={{ duration: 0.4, delay: i * 0.12 }}
            >
              <div className="mb-2 flex items-center gap-2">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-[var(--text-primary)]"
                  style={{ background: "var(--surface-overlay)" }}
                >
                  {p.name[0]}
                </div>
                <span className="text-sm font-medium text-[var(--text-primary)]">{p.name}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  private chat
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] italic">"{p.thought}..."</p>
              <motion.div
                className="mt-2 h-1 rounded-full bg-[var(--accent-tint)]"
                initial={{ width: 0 }}
                animate={phase >= 1 ? { width: "100%" } : { width: 0 }}
                transition={{ duration: 0.6, delay: i * 0.12 + 0.2 }}
              />
            </motion.div>
          ))}
        </div>

        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
            <line x1="10" y1="30" x2="50" y2="30" stroke="var(--text-muted)" strokeWidth="1.5" />
            <path
              d="M44 24L50 30L44 36"
              stroke="var(--text-muted)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>

        <motion.div
          className="w-72 rounded-xl border border-[var(--accent-secondary)] bg-[var(--accent-secondary-tint)] p-5"
          initial={{ opacity: 0, x: 20 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
          transition={{ duration: 0.5 }}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--accent-secondary)]">
            What the team has
          </p>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            Four parallel monologues with no merge step. The team meeting is the merge step,
            and it loses 80% of what each person actually thought.
          </p>
        </motion.div>
      </div>

      <motion.p
        className="mt-12 max-w-3xl text-center text-base text-[var(--text-secondary)]"
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        Teams need a place where individual thinking gets pooled, compared, and surfaced
        as collective signal — without giving up the privacy of the dump itself.
      </motion.p>
    </motion.div>
  );
}
