import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

const ROWS = [
  { label: "GPU VRAM (RTX A1000 laptop)", value: "6.0 GB", kind: "budget" },
  { label: "gemma3:4b Q4_K_M weights", value: "~2.6 GB", kind: "spend" },
  { label: "KV cache @ 8k context", value: "~1.0 GB", kind: "spend" },
  { label: "System / display reserve", value: "~0.8 GB", kind: "spend" },
  { label: "Headroom", value: "~1.6 GB", kind: "left" },
  { label: "gemma3:12b Q4_K_M would need", value: "~7.3 GB · overflows VRAM", kind: "bad" },
];

export function HardwareBudget({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Act 5 · Hardware budget
      </p>
      <h2 className="mb-2 text-center text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
        Why 4B is the ceiling on this laptop
      </h2>
      <p className="mb-10 max-w-3xl text-center text-sm text-[var(--text-secondary)]">
        The A1000 6 GB has no escape hatch. We're either on gemma3:4b, on CPU (10x slower
        than already slow), or on a remote API.
      </p>

      <div className="w-full max-w-3xl">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {ROWS.map((r, i) => {
            const tint =
              r.kind === "budget"
                ? "var(--info)"
                : r.kind === "spend"
                  ? "var(--accent)"
                  : r.kind === "left"
                    ? "var(--agreement)"
                    : "var(--contradiction)";
            return (
              <motion.div
                key={r.label}
                className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3 last:border-b-0"
                initial={{ x: -10, opacity: 0 }}
                animate={isActive ? { x: 0, opacity: 1 } : { x: -10, opacity: 0 }}
                transition={{ duration: 0.3, delay: 0.15 + i * 0.08 }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: tint }}
                  />
                  <span className="text-[12px] text-[var(--text-secondary)]">{r.label}</span>
                </div>
                <code className="font-mono text-[12px]" style={{ color: tint }}>
                  {r.value}
                </code>
              </motion.div>
            );
          })}
        </div>
      </div>

      <motion.div
        className="mt-10 grid w-full max-w-3xl grid-cols-3 gap-4"
        initial={{ opacity: 0 }}
        animate={isActive ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.7 }}
      >
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            throughput
          </p>
          <p className="font-mono text-sm text-[var(--text-primary)]">~35 tok/s</p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">extract call ≈ 17-44 s</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            3-dump synthesis
          </p>
          <p className="font-mono text-sm text-[var(--text-primary)]">~2-4 min</p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">extract × 3 + merge + render</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            cold start
          </p>
          <p className="font-mono text-sm text-[var(--text-primary)]">+30-60 s</p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">model load on first call</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
