import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { SlideProps } from "../StepIndicator";

const PRINCIPLES = [
  {
    title: "Per-project",
    body: "Each project has its own problem statement, materials, and dump pool. No cross-project bleed.",
  },
  {
    title: "Local-first",
    body: "Everything runs on the laptop or office machine. No cloud, no API keys, no data leaves the team.",
  },
  {
    title: "Cross-user synthesis",
    body: "Personal dumps stay personal. Extracted ideas become a shared graph with author attribution.",
  },
  {
    title: "Citation-grounded",
    body: "Every synthesized claim quotes a source dump verbatim. The agent cannot fabricate consensus.",
  },
];

export function Vision({ isActive }: SlideProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setPhase(0);
      return;
    }
    const t = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1400),
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
        The vision
      </p>
      <h2 className="mb-3 text-center text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
        A team second brain that actually merges
      </h2>
      <p className="mb-12 max-w-2xl text-center text-base text-[var(--text-secondary)]">
        Inspired by Obsidian and the LLM-wiki second-brain tradition. Built for teams.
      </p>

      <div className="grid w-full max-w-5xl grid-cols-2 gap-4">
        {PRINCIPLES.map((p, i) => (
          <motion.div
            key={p.title}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
            initial={{ opacity: 0, y: 12 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-light)] bg-[var(--surface-elevated)] text-xs font-mono text-[var(--accent)]">
                {String(i + 1).padStart(2, "0")}
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{p.title}</h3>
            </div>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{p.body}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="mt-12 flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5"
        initial={{ opacity: 0 }}
        animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
          POC promise
        </span>
        <span className="text-sm text-[var(--text-secondary)]">
          One command to clone, one to run, two teammates can collaborate end-to-end
        </span>
      </motion.div>
    </motion.div>
  );
}
