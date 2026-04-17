import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { SlideProps } from "../StepIndicator";

const PERSONAS = [
  {
    id: "synthesis",
    name: "Mode A · Synthesis",
    purpose: "Reads dumps, extracts ideas, surfaces agreements / contradictions",
    voice: "Conservative, citation-grounded, neutral, never speculates",
    temp: 0.4,
    top_p: 0.8,
    color: "var(--accent)",
    file: "prompts/synthesis.md",
  },
  {
    id: "exploration",
    name: "Mode B · Exploration",
    purpose: "Standalone brainstorm chat for new directions or fresh problems",
    voice: "Divergent, generative, willing to propose, optional graph retrieval",
    temp: 1.0,
    top_p: 0.95,
    color: "var(--accent-secondary)",
    file: "prompts/exploration.md",
  },
];

export function DualAgent({ isActive }: SlideProps) {
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
        Agent infrastructure
      </p>
      <h2 className="mb-3 text-center text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
        One model, two personas, two tabs
      </h2>
      <p className="mb-10 max-w-3xl text-center text-base text-[var(--text-secondary)]">
        Same Gemma weights. Different markdown prompt cards with YAML frontmatter for model,
        temperature, sampling. Hot-reloaded in dev, versioned in git.
      </p>

      <div className="grid w-full max-w-6xl grid-cols-2 gap-5">
        {PERSONAS.map((p, i) => (
          <motion.div
            key={p.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
            initial={{ opacity: 0, y: 16 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: 0.5, delay: i * 0.15 }}
            style={{ borderTop: `3px solid ${p.color}` }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{p.name}</h3>
              <code className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                {p.file}
              </code>
            </div>

            <div className="mb-4 space-y-3 text-sm">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Purpose
                </p>
                <p className="text-[var(--text-secondary)]">{p.purpose}</p>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Voice
                </p>
                <p className="text-[var(--text-secondary)]">{p.voice}</p>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Sampling
              </p>
              <div className="flex items-center gap-4 font-mono text-xs">
                <div>
                  <span className="text-[var(--text-muted)]">temp</span>
                  <span className="ml-1.5" style={{ color: p.color }}>
                    {p.temp.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">top_p</span>
                  <span className="ml-1.5" style={{ color: p.color }}>
                    {p.top_p}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">model</span>
                  <span className="ml-1.5" style={{ color: p.color }}>
                    gemma4:4b
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="mt-8 flex w-full max-w-6xl items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        initial={{ opacity: 0 }}
        animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Inference contract (single backend service)
          </p>
          <code className="font-mono text-xs text-[var(--text-secondary)]">
            inference.run(persona_id, messages, override?) → resolves prompt + params from
            registry → POSTs Ollama /api/chat → SSE stream
          </code>
        </div>
        <div className="h-12 w-px bg-[var(--border)]" />
        <div className="flex-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Cross-mode data
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Exploration agent gets a <code className="font-mono text-[var(--accent)]">retrieve_from_graph()</code> tool — opt-in only,
            never inlined into the system prompt
          </p>
        </div>
      </motion.div>

      <motion.div
        className="mt-6 flex items-center gap-3 rounded-full border border-[var(--border-light)] bg-[var(--accent-tint)] px-4 py-2"
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
          Anthropic-pattern, Gemma-adapted
        </span>
        <span className="text-xs text-[var(--text-secondary)]">
          Markdown headers (not XML) for sections · system text prepended to first user turn ·
          static-vs-dynamic boundary mirrored from Claude Code's pattern
        </span>
      </motion.div>
    </motion.div>
  );
}
