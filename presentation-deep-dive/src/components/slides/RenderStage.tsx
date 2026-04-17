import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

// Verbatim from app/src/inference/renderer.ts:9-32 (post-backprop-2 T001 display_name addition)
const RENDER_INSTRUCTIONS = `You will receive a JSON snapshot of a project's clustered ideas,
contradiction edges, and attribution. Render a markdown document with
exactly three sections:

## Agreed
- one bullet per cluster of size >= 2 (multiple authors converged)
- end each bullet with one or more [Author, dump-id] citations from the cluster's attribution

## Disputed
- one bullet per contradiction edge
- quote BOTH sides in their author's voice with [Author, dump-id] citations

## Move forward
- one bullet per "deliverable"-typed idea that has cluster support and no attached contradiction
- end with [Author, dump-id] citation

Hard rules:
- Every bullet must end with at least one [Author, dump-id] citation in that exact format
- Author is the human display name (e.g. "Alice"), exactly as it appears in the attribution's "author" field — never a UUID.
- dump-id is the FULL string in the attribution's "dump_id" field including any timestamp suffix — copy it verbatim, do not truncate.
- Use the verbatim_quote from attribution where you reference the dump
- Output the markdown directly. No preamble, no JSON, no code fences around the document.`;

// Real fragment from latest.md after backprop fixes landed
const REAL_OUTPUT = `## Agreed
- lcuasduys, bob: putting billing at step 3 is what broke the funnel
  [lcuasduys, 1cea426c-4f80-4da5-b17d-38caa04313fe-2026-04-17T12-54-55-441z]
- bob: I can have the soft path branch behind a flag in two days,
  behind one prod gate. [bob, 6827d9fc-79c9-45ea-888d-632318ee63fc-2026-04-17T12-55-19-340z]

## Concerns
- bob, bob: I disagree with Alice that we don't need an A/B test...
  [bob, 6827d9fc-79c9-45ea-888d-632318ee63fc-2026-04-17T12-55-19-340z]`;

export function RenderStage({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8 py-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Act 2 · Stage 3 of 4 — Render
      </p>
      <h2 className="mb-2 text-center text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
        JSON snapshot → markdown doc
      </h2>
      <p className="mb-6 max-w-3xl text-center text-sm text-[var(--text-secondary)]">
        This is where the model has the most freedom to drift. Three required sections,
        citation format enforced by validator, up to 2 retries on validation failure.
      </p>

      <div className="grid w-full max-w-6xl gap-5 md:grid-cols-[1.3fr_1fr]">
        <motion.div
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          initial={{ x: -16, opacity: 0 }}
          animate={isActive ? { x: 0, opacity: 1 } : { x: -16, opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]">
              RENDER_INSTRUCTIONS (verbatim)
            </p>
            <code className="font-mono text-[10px] text-[var(--text-muted)]">
              renderer.ts:9-32
            </code>
          </div>
          <pre className="max-h-[26rem] overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">
            {RENDER_INSTRUCTIONS}
          </pre>
        </motion.div>

        <motion.div
          className="flex flex-col gap-4"
          initial={{ x: 16, opacity: 0 }}
          animate={isActive ? { x: 0, opacity: 1 } : { x: 16, opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--agreement)]">
              Real latest.md (post-fix, 2026-04-17)
            </p>
            <pre className="max-h-[16rem] overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">
              {REAL_OUTPUT}
            </pre>
          </div>
          <div className="rounded-xl border border-[var(--contradiction)] bg-[var(--accent-secondary-tint)] p-4">
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--contradiction)]">
                Note the model's drift:
              </span>{" "}
              section 2 is titled "Concerns" — the spec said "Disputed". Prompt adherence
              on 4B models is partial. Validator doesn't care about section headers, just
              citation format, so it still shipped.
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
