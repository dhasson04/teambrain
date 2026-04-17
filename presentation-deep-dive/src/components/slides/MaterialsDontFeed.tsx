import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

// Real grep evidence captured 2026-04-17 from app/src/inference/
const GREP_INFERENCE = `$ grep -rn "materials\\|problem\\.md\\|readProblem\\|listMaterials" \\
       app/src/inference/

# (no matches)`;

const GREP_SERVER_WEB = `$ grep -rn "readProblem\\|listMaterials" app/src/server app/web

app/src/server/routes/materials.ts:6:   listMaterials,
app/src/server/routes/materials.ts:7:   readProblem,
app/src/server/routes/materials.ts:23:  const out = await readProblem(...)
app/src/server/routes/materials.ts:41:  c.json({ materials: await listMaterials(...) })
app/web/lib/api.ts:164:                  listMaterials: (project, sub) => ...
app/web/components/SubprojectView/MainTab.tsx:40:  apiClient.listMaterials(...)`;

export function MaterialsDontFeed({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8 py-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--contradiction)]">
        Act 4 · The big lie
      </p>
      <motion.h2
        className="mb-3 text-center text-5xl font-bold tracking-tight text-[var(--contradiction)]"
        initial={{ y: 12, opacity: 0 }}
        animate={isActive ? { y: 0, opacity: 1 } : { y: 12, opacity: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        Materials never reach the LLM
      </motion.h2>
      <motion.p
        className="mb-8 max-w-3xl text-center text-base text-[var(--text-secondary)]"
        initial={{ opacity: 0 }}
        animate={isActive ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        The prompt says{" "}
        <em className="text-[var(--text-primary)]">"Given a project's problem statement,
        optional materials, and a set of dumps..."</em>{" "}
        — but the synthesis pipeline is wired to dumps only. The grep tells the whole story.
      </motion.p>

      <div className="grid w-full max-w-6xl gap-5 md:grid-cols-2">
        <motion.div
          className="rounded-xl border border-[var(--contradiction)] bg-[var(--accent-secondary-tint)] p-5"
          initial={{ x: -16, opacity: 0 }}
          animate={isActive ? { x: 0, opacity: 1 } : { x: -16, opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--contradiction)]">
            Inference pipeline (where the LLM is)
          </p>
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {GREP_INFERENCE}
          </pre>
          <p className="mt-4 text-[11px] font-semibold text-[var(--text-primary)]">
            ZERO matches in app/src/inference/.
          </p>
        </motion.div>

        <motion.div
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          initial={{ x: 16, opacity: 0 }}
          animate={isActive ? { x: 0, opacity: 1 } : { x: 16, opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--info)]">
            Server routes + UI (where they ARE used)
          </p>
          <pre className="max-h-[14rem] overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">
            {GREP_SERVER_WEB}
          </pre>
          <p className="mt-4 text-[11px] text-[var(--text-muted)]">
            UI-only surfaces. Materials render in the Main tab. Problem statement is shown
            at the top of the same tab. Neither path reaches the synthesis pipeline.
          </p>
        </motion.div>
      </div>

      <motion.div
        className="mt-8 w-full max-w-5xl rounded-xl border border-[var(--warning)] bg-[color-mix(in_oklch,var(--warning)_12%,var(--background))] p-5"
        initial={{ y: 12, opacity: 0 }}
        animate={isActive ? { y: 0, opacity: 1 } : { y: 12, opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.7 }}
      >
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--warning)]">
          Implication for the 2026-04-17 smoke test
        </p>
        <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
          We pasted a 30-line kickoff meeting transcript ("Attendees: Alice, Bob, Carol,
          Dan... Funnel data... Hypotheses raised... Next steps") as a material. The
          synthesis output did not cite it, reference it, or benefit from it in any way.
          The LLM never saw those bytes.{" "}
          <span className="font-semibold text-[var(--text-primary)]">
            Fix direction (out of scope for this deck):
          </span>{" "}
          concatenate problem.md + materials/*.md into a{" "}
          <code className="font-mono text-[var(--warning)]">&lt;project-context&gt;</code>{" "}
          block and prepend it to the merge OR render prompt.
        </p>
      </motion.div>
    </motion.div>
  );
}
