import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { SlideProps } from "../StepIndicator";

const MODELS = [
  {
    name: "Gemma 4 4B",
    size: "Q4_K_M ~ 2.8 GB",
    fits: true,
    speed: "30-40 tok/s",
    quality: "Good for extraction, decent for synthesis prose",
    note: "Default for dev",
  },
  {
    name: "Gemma 3 12B",
    size: "Q4_K_M ~ 7 GB",
    fits: false,
    speed: "5-10 tok/s",
    quality: "Better synthesis prose, stronger reasoning",
    note: "Spills to system RAM (Ollama auto), slower",
  },
  {
    name: "Gemma 4 12B",
    size: "Q4_K_M ~ 7 GB",
    fits: false,
    speed: "5-10 tok/s",
    quality: "Best of the local options for synthesis",
    note: "Tooling still maturing in early 2026",
  },
];

export function Hardware({ isActive }: SlideProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setPhase(0);
      return;
    }
    const t = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1800),
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
        Hardware reality
      </p>
      <h2 className="mb-3 text-center text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
        What runs on your laptop
      </h2>

      <motion.div
        className="mb-8 inline-flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2"
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Your machine
        </span>
        <code className="font-mono text-xs text-[var(--text-secondary)]">i7 13th gen</code>
        <span className="text-[var(--text-muted)]">·</span>
        <code className="font-mono text-xs text-[var(--text-secondary)]">16 GB RAM</code>
        <span className="text-[var(--text-muted)]">·</span>
        <code className="font-mono text-xs text-[var(--text-secondary)]">RTX A1000 6 GB</code>
      </motion.div>

      <div className="grid w-full max-w-6xl grid-cols-3 gap-4">
        {MODELS.map((m, i) => (
          <motion.div
            key={m.name}
            className="rounded-xl border bg-[var(--surface)] p-5"
            style={{
              borderColor: i === 0 ? "var(--accent)" : "var(--border)",
              borderWidth: i === 0 ? 2 : 1,
            }}
            initial={{ opacity: 0, y: 16 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: 0.4, delay: i * 0.12 }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">{m.name}</h3>
              {i === 0 && (
                <span className="rounded-md bg-[var(--accent-tint)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                  default
                </span>
              )}
            </div>
            <div className="mb-3 font-mono text-[11px] text-[var(--text-muted)]">{m.size}</div>

            <div className="mb-3 flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: m.fits ? "var(--agreement)" : "var(--warning)" }}
              />
              <span className="text-xs text-[var(--text-secondary)]">
                {m.fits ? "Fits in 6 GB VRAM" : "Exceeds 6 GB VRAM"}
              </span>
            </div>

            <div className="mb-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-2.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Throughput
              </p>
              <p className="font-mono text-sm" style={{ color: m.fits ? "var(--agreement)" : "var(--warning)" }}>
                {m.speed}
              </p>
            </div>

            <p className="mb-2 text-xs leading-relaxed text-[var(--text-secondary)]">{m.quality}</p>
            <p className="text-[11px] italic text-[var(--text-muted)]">{m.note}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="mt-8 grid w-full max-w-4xl grid-cols-2 gap-4"
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Config swap
          </p>
          <pre className="font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">{`# prompts/synthesis.md frontmatter
model: gemma4:4b      # fast iteration
# model: gemma3:12b   # higher quality
temperature: 0.4`}</pre>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Path to better quality
          </p>
          <ul className="space-y-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
            <li>· Run 12B for synthesis only, 4B for extraction (two-stage)</li>
            <li>· Move 12B to an office workstation with a 12 GB+ GPU later</li>
            <li>· Server pattern: vLLM + Llama 3.3 70B Q4 for production team</li>
          </ul>
        </div>
      </motion.div>

      <motion.p
        className="mt-10 text-center text-sm text-[var(--text-muted)]"
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        Press R to restart from the title slide
      </motion.p>
    </motion.div>
  );
}
