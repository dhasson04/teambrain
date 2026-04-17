import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { SlideProps } from "../StepIndicator";

const STAGES = [
  {
    label: "Capture",
    sub: "Each teammate writes a dump",
    detail: "dumps/<author>-<ts>.md",
    color: "var(--info)",
  },
  {
    label: "Extract",
    sub: "Per-dump idea extraction (cached by BLAKE3)",
    detail: "ideas[] = [{statement, type, evidence_quote, author}]",
    color: "var(--accent)",
  },
  {
    label: "Merge",
    sub: "Cluster ideas across all dumps; flag contradictions",
    detail: "clusters[] + contradictions[] + edges[]",
    color: "var(--accent-secondary)",
  },
  {
    label: "Synthesize",
    sub: "Render agreement / disagreement / move-forward",
    detail: "synthesis/latest.md (with citations)",
    color: "var(--agreement)",
  },
];

export function Pipeline({ isActive }: SlideProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setPhase(0);
      return;
    }
    const t = STAGES.map((_, i) => setTimeout(() => setPhase(i + 1), 500 + i * 800));
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
        Cross-user pipeline
      </p>
      <h2 className="mb-3 text-center text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
        Personal dumps to shared synthesis
      </h2>
      <p className="mb-12 max-w-2xl text-center text-base text-[var(--text-secondary)]">
        Personal text stays private. Extracted ideas become a shared artifact with author
        attribution on every node.
      </p>

      <div className="relative w-full max-w-6xl">
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <line x1="12.5%" y1="50%" x2="87.5%" y2="50%" stroke="var(--border)" strokeWidth="1" />
          <motion.line
            x1="12.5%"
            y1="50%"
            x2="12.5%"
            y2="50%"
            stroke="var(--accent)"
            strokeWidth="1.5"
            initial={{ x2: "12.5%" }}
            animate={{ x2: `${12.5 + (phase / STAGES.length) * 75}%` }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          />
        </svg>

        <div className="relative grid grid-cols-4 gap-6">
          {STAGES.map((s, i) => {
            const isActive = i < phase;
            const isCurrent = i === phase - 1;
            return (
              <div key={s.label} className="flex flex-col items-center">
                <motion.div
                  className="relative z-10 mb-4 flex h-12 w-12 items-center justify-center rounded-full border-2"
                  animate={{
                    borderColor: isActive ? s.color : "var(--border)",
                    backgroundColor: isActive ? "var(--surface-elevated)" : "var(--surface)",
                  }}
                  transition={{ duration: 0.4 }}
                >
                  <motion.span
                    className="font-mono text-sm font-semibold"
                    animate={{ color: isActive ? s.color : "var(--text-muted)" }}
                    transition={{ duration: 0.4 }}
                  >
                    {i + 1}
                  </motion.span>
                  {isCurrent && (
                    <span
                      className="pulse-ring absolute inset-[-6px] rounded-full border"
                      style={{ borderColor: s.color }}
                      aria-hidden
                    />
                  )}
                </motion.div>

                <motion.div
                  className="w-full rounded-xl border bg-[var(--surface)] p-4"
                  animate={{
                    borderColor: isActive ? "var(--border-light)" : "var(--border)",
                    opacity: isActive ? 1 : 0.5,
                  }}
                  transition={{ duration: 0.4 }}
                >
                  <h3 className="mb-1.5 text-base font-semibold text-[var(--text-primary)]">
                    {s.label}
                  </h3>
                  <p className="mb-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {s.sub}
                  </p>
                  <div className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5">
                    <code className="font-mono text-[10px] leading-tight text-[var(--text-secondary)]">
                      {s.detail}
                    </code>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>

      <motion.div
        className="mt-10 flex items-center gap-6 text-xs text-[var(--text-muted)]"
        initial={{ opacity: 0 }}
        animate={phase >= STAGES.length ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
          <span>Each stage caches by BLAKE3 hash; only changed dumps re-process</span>
        </div>
        <div className="h-3 w-px bg-[var(--border)]" />
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--accent-secondary)]" />
          <span>POC fits one project in Gemma's context window — embeddings deferred</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
