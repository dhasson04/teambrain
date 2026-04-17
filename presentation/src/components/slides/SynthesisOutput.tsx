import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { SlideProps } from "../StepIndicator";

const AGREED = [
  {
    statement: "Step 3 is asking for billing info too early in the funnel",
    support: ["Alice", "Lucas", "Bob"],
    quotes: [
      { author: "Alice", text: "We're losing people right at the credit-card field" },
      { author: "Lucas", text: "Last cohort that bypassed step 3 had 2x activation" },
    ],
  },
  {
    statement: "The Q1 redesign optimized for conversion intent over discovery",
    support: ["Bob", "Carol"],
    quotes: [{ author: "Bob", text: "We removed the playground tour to shorten the funnel" }],
  },
];

const DISPUTED = [
  {
    topic: "Whether to remove billing entirely vs make it optional",
    sides: [
      { author: "Lucas", stance: "Make it optional with a clear upgrade path later" },
      { author: "Carol", stance: "Removing it risks freemium-only users with no path to revenue" },
    ],
  },
];

const FORWARD = [
  "A/B test split-funnel (soft onboarding without billing) vs current funnel",
  "Target: ship test by April 28, results by May 12 launch window",
];

export function SynthesisOutput({ isActive }: SlideProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setPhase(0);
      return;
    }
    const t = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1100),
      setTimeout(() => setPhase(3), 1900),
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
        Synthesis tab
      </p>
      <h2 className="mb-3 text-center text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
        Agree, disagree, move forward
      </h2>
      <p className="mb-10 max-w-2xl text-center text-base text-[var(--text-secondary)]">
        Every claim is hover-traceable to source dumps. The agent is forbidden from making any
        claim it cannot quote a dump for verbatim.
      </p>

      <div className="grid w-full max-w-6xl grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.4 }}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          style={{ borderLeft: "3px solid var(--agreement)" }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--agreement)]">
              Agreed
            </h3>
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              high consensus
            </span>
          </div>
          <div className="space-y-4">
            {AGREED.map((item, i) => (
              <div key={i} className="space-y-2">
                <p className="text-sm font-medium leading-relaxed text-[var(--text-primary)]">
                  {item.statement}
                </p>
                <div className="flex items-center gap-1">
                  {item.support.map((a) => (
                    <span
                      key={a}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-overlay)] text-[9px] font-semibold text-[var(--text-secondary)]"
                    >
                      {a[0]}
                    </span>
                  ))}
                  <span className="ml-2 text-[10px] text-[var(--text-muted)]">
                    {item.support.length} of 4
                  </span>
                </div>
                {item.quotes.slice(0, 1).map((q, qi) => (
                  <div key={qi} className="rounded-md border-l border-[var(--border-light)] bg-[var(--background)] py-1.5 pl-3 pr-2">
                    <p className="text-xs italic leading-relaxed text-[var(--text-secondary)]">
                      "{q.text}"
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">— {q.author}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.4 }}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          style={{ borderLeft: "3px solid var(--contradiction)" }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--contradiction)]">
              Disputed
            </h3>
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              explicit conflict
            </span>
          </div>
          <div className="space-y-4">
            {DISPUTED.map((d, i) => (
              <div key={i}>
                <p className="mb-3 text-sm font-medium leading-relaxed text-[var(--text-primary)]">
                  {d.topic}
                </p>
                <div className="space-y-2">
                  {d.sides.map((s, si) => (
                    <div key={si} className="rounded-md border border-[var(--border)] bg-[var(--background)] p-2.5">
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--surface-overlay)] text-[9px] font-semibold text-[var(--text-secondary)]">
                          {s.author[0]}
                        </span>
                        <span className="text-[10px] font-medium text-[var(--text-muted)]">{s.author}</span>
                      </div>
                      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                        "{s.stance}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.4 }}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          style={{ borderLeft: "3px solid var(--accent-secondary)" }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--accent-secondary)]">
              Move forward
            </h3>
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              consensus actions
            </span>
          </div>
          <div className="space-y-3">
            {FORWARD.map((item, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--border-light)] bg-[var(--background)]" />
                <span className="text-sm leading-relaxed text-[var(--text-secondary)]">{item}</span>
              </label>
            ))}
            <div className="mt-4 rounded-md border border-[var(--accent-secondary)] bg-[var(--accent-secondary-tint)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-[var(--accent-secondary)]">
                Synthesis trust mark
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Generated 2 minutes ago from 4 dumps. Re-runs on dump change.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.p
        className="mt-8 text-center text-sm text-[var(--text-muted)]"
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        Output is plain markdown in <code className="font-mono text-[var(--accent)]">synthesis/latest.md</code> — diffable, scriptable, and survives any UI rewrite
      </motion.p>
    </motion.div>
  );
}
