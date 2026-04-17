import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

const FIXES = [
  {
    id: "BUG-1",
    title: "Bun.serve idleTimeout killed SSE mid-run",
    change: "idleTimeout: 0 on Bun.serve — connection survives long Ollama calls",
    commit: "dee4af3",
    evidence: "0 disconnects across 15+ consecutive Ollama calls in one stream",
  },
  {
    id: "BUG-2",
    title: "Extractor dropped 95%+ of ideas on gemma3:4b",
    change: "normalized evidence_quote match + configurable retries (extract_max_retries)",
    commit: "9dd5bda",
    evidence: "recall: 1 idea → 6 ideas on same 3 dumps. Bob 0 → 4, Carol 0 → 1.",
  },
  {
    id: "BUG-3a",
    title: "Renderer cited profile UUID as dump-id",
    change: "display_name in attribution JSON, not UUID — removes UUID-vs-UUID ambiguity",
    commit: "2a91a4b",
    evidence: "post-fix: `[lcuasduys, 1cea426c-...-2026-04-17T12-54-55-441z]` (full id)",
  },
  {
    id: "BUG-3b",
    title: "Validator rejected identical complaint 3/3 retries",
    change: "dump-id prefix tolerance + ambiguous-prefix actionable complaint",
    commit: "229d3ff",
    evidence: "render first-attempt success; tests: 150 → 153 pass",
  },
  {
    id: "BUG-4",
    title: "Phase label stuck on \"extracting…\" for entire run",
    change: "Vite /api proxy configure handler: X-Accel-Buffering: no, Cache-Control: no-transform",
    commit: "44ddd47",
    evidence: "SSE events arrive per-event instead of batched at stream close",
  },
  {
    id: "BUG-5",
    title: "Suspected client-side auto-restart",
    change: "documented single-run invariant + in-source assertion tests",
    commit: "14fd670",
    evidence: "158 / 0 skip / 0 fail — all backprop regression scaffolds enabled",
  },
];

export function BackpropFixes({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8 py-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Act 6 · What we fixed
      </p>
      <h2 className="mb-2 text-center text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
        Five bugs, five spec gaps, six commits
      </h2>
      <p className="mb-6 max-w-3xl text-center text-sm text-[var(--text-secondary)]">
        Each bug was traced to a missing acceptance criterion, the spec was updated, a
        regression test was scaffolded, and only then was the fix implemented. Forge
        backprop workflow, autonomy=full.
      </p>

      <div className="w-full max-w-5xl space-y-2">
        {FIXES.map((f, i) => (
          <motion.div
            key={f.id}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5"
            initial={{ x: -10, opacity: 0 }}
            animate={isActive ? { x: 0, opacity: 1 } : { x: -10, opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.15 + i * 0.07 }}
          >
            <div className="shrink-0 rounded-md border border-[var(--agreement)] bg-[color-mix(in_oklch,var(--agreement)_12%,var(--background))] px-2 py-1">
              <code className="font-mono text-[10px] font-semibold text-[var(--agreement)]">
                {f.id}
              </code>
            </div>
            <div>
              <p className="mb-0.5 text-[12px] font-semibold text-[var(--text-primary)]">
                {f.title}
              </p>
              <p className="text-[11px] leading-tight text-[var(--text-secondary)]">
                <span className="text-[var(--accent)]">fix</span> {f.change}
              </p>
              <p className="text-[10px] leading-tight text-[var(--text-muted)]">
                <span className="text-[var(--agreement)]">evidence</span> {f.evidence}
              </p>
            </div>
            <code className="shrink-0 rounded-md border border-[var(--border-light)] bg-[var(--surface-elevated)] px-2 py-1 font-mono text-[10px] text-[var(--accent)]">
              {f.commit}
            </code>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
