import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { SlideProps } from "../StepIndicator";

const TABS = [
  { key: "main", label: "Main", desc: "Problem statement + uploaded materials + activity" },
  { key: "dump", label: "My Dump", desc: "Your private brain dump composer" },
  { key: "graph", label: "Connections", desc: "Knowledge graph of ideas across the team" },
  { key: "synth", label: "Synthesis", desc: "Agreements, contradictions, action items" },
] as const;

const PROJECTS = [
  { name: "Acme Corp", expanded: true, sub: ["Q2 Strategy", "Onboarding"] },
  { name: "Beta Project", expanded: false, sub: ["Discovery"] },
];

export function SubprojectLayout({ isActive }: SlideProps) {
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setActiveTab(0);
      return;
    }
    const id = setInterval(() => {
      setActiveTab((t) => (t + 1) % TABS.length);
    }, 2400);
    return () => clearInterval(id);
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
        App shell
      </p>
      <h2 className="mb-10 text-center text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
        Project &gt; Subproject &gt; 4 tabs
      </h2>

      <motion.div
        className="w-full max-w-6xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex h-[460px]">
          <aside className="flex w-64 flex-col border-r border-[var(--border)] bg-[var(--background)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                Projects
              </span>
              <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {PROJECTS.map((proj) => (
              <div key={proj.name} className="mb-2">
                <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-[var(--text-secondary)]">
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className={proj.expanded ? "rotate-90" : ""}>
                    <path d="M2 1L6 4.5L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  <span className="font-medium">{proj.name}</span>
                </div>
                {proj.expanded && (
                  <div className="ml-4 mt-1 flex flex-col gap-0.5">
                    {proj.sub.map((s, i) => (
                      <button
                        key={s}
                        className={`rounded-md px-2 py-1 text-left text-xs transition-colors ${
                          i === 0
                            ? "bg-[var(--accent-tint)] text-[var(--text-primary)]"
                            : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)]"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="mt-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-tint)] text-[10px] font-semibold text-[var(--accent)]">
                  L
                </div>
                <span className="text-xs text-[var(--text-secondary)]">You: Lucas</span>
              </div>
            </div>
          </aside>

          <main className="flex flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-elevated)] px-5 py-2.5">
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <span>Acme Corp</span>
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M2 1L6 4.5L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span className="text-[var(--text-secondary)]">Q2 Strategy</span>
              </div>
              <button className="rounded-md border border-[var(--border-light)] bg-[var(--surface)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                Re-synthesize
              </button>
            </div>

            <div className="flex border-b border-[var(--border)] bg-[var(--surface)]">
              {TABS.map((tab, i) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(i)}
                  className="relative px-5 py-3 text-sm transition-colors"
                  style={{
                    color: i === activeTab ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  <span className={i === activeTab ? "font-semibold" : "font-medium"}>
                    {tab.label}
                  </span>
                  {i === activeTab && (
                    <motion.div
                      layoutId="tab-underline"
                      className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[var(--accent)]"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-hidden p-6">
              <motion.div
                key={TABS[activeTab].key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  {TABS[activeTab].label}
                </p>
                <p className="mb-5 text-sm text-[var(--text-secondary)]">
                  {TABS[activeTab].desc}
                </p>

                {activeTab === 0 && <MainPreview />}
                {activeTab === 1 && <DumpPreview />}
                {activeTab === 2 && <GraphPreview />}
                {activeTab === 3 && <SynthPreview />}
              </motion.div>
            </div>
          </main>
        </div>
      </motion.div>

      <p className="mt-6 text-xs text-[var(--text-muted)]">
        Tabs auto-cycle so you can see all four
      </p>
    </motion.div>
  );
}

function MainPreview() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Problem statement
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          Acme's onboarding conversion dropped 18% after the Q1 redesign. We need to figure out
          why and propose a fix before the May launch window.
        </p>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Materials (3)
        </p>
        <div className="space-y-1.5 text-sm text-[var(--text-secondary)]">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--text-muted)]">md</span>
            meeting-2026-04-12.md
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--text-muted)]">md</span>
            client-brief-q2.md
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--text-muted)]">md</span>
            funnel-analytics-march.md
          </div>
        </div>
      </div>
    </div>
  );
}

function DumpPreview() {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          New dump
        </p>
        <span className="text-[10px] text-[var(--text-muted)]">private to you</span>
      </div>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
        Honestly the new step 3 is doing too much. We're asking for billing info before they've
        even seen the value. Last cohort that bypassed it had a 2x activation rate. I think we
        split it into a soft and hard onboarding path
        <span className="cursor-blink ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-[var(--accent)]" />
      </p>
    </div>
  );
}

function GraphPreview() {
  return (
    <svg viewBox="0 0 380 200" className="w-full">
      <line x1="80" y1="50" x2="190" y2="100" stroke="var(--agreement)" strokeWidth="1.5" />
      <line x1="190" y1="100" x2="300" y2="50" stroke="var(--agreement)" strokeWidth="1.5" />
      <line x1="190" y1="100" x2="120" y2="160" stroke="var(--border-light)" strokeWidth="1" />
      <line x1="190" y1="100" x2="280" y2="160" stroke="var(--contradiction)" strokeWidth="1.5" strokeDasharray="4 3" />
      {[
        { x: 80, y: 50, label: "billing\nfriction" },
        { x: 300, y: 50, label: "step 3\noverload" },
        { x: 190, y: 100, label: "onboarding\nflow" },
        { x: 120, y: 160, label: "value first" },
        { x: 280, y: 160, label: "freemium\nrisk" },
      ].map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r="22" fill="var(--surface-elevated)" stroke="var(--border-light)" strokeWidth="1.2" />
          <text x={n.x} y={n.y - 2} textAnchor="middle" fill="var(--text-secondary)" fontSize="9">
            {n.label.split("\n")[0]}
          </text>
          <text x={n.x} y={n.y + 8} textAnchor="middle" fill="var(--text-secondary)" fontSize="9">
            {n.label.split("\n")[1]}
          </text>
        </g>
      ))}
    </svg>
  );
}

function SynthPreview() {
  return (
    <div className="space-y-2.5">
      <div className="rounded-lg border-l-2 border-[var(--agreement)] bg-[var(--background)] p-3 pl-4">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--agreement)]">
          Agreed (3 of 4)
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          Step 3 is asking for billing info too early in the funnel
        </p>
      </div>
      <div className="rounded-lg border-l-2 border-[var(--contradiction)] bg-[var(--background)] p-3 pl-4">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--contradiction)]">
          Disputed
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          Whether to keep billing as optional vs remove entirely (Lucas vs Carol)
        </p>
      </div>
      <div className="rounded-lg border-l-2 border-[var(--accent-secondary)] bg-[var(--background)] p-3 pl-4">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-secondary)]">
          Move forward
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          A/B test split-funnel vs current funnel for May launch window
        </p>
      </div>
    </div>
  );
}
