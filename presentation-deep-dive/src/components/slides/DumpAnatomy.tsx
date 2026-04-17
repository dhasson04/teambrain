import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

// Real content from app/vault/projects/acme-q2-onboarding/subprojects/funnel-investigation/
// /dumps/6827d9fc-79c9-45ea-888d-632318ee63fc-2026-04-17T12-55-19-340z.md
const FRONTMATTER = `---
author: 6827d9fc-79c9-45ea-888d-632318ee63fc
created: 2026-04-17T12:55:19.340Z
updated: 2026-04-17T12:55:19.340Z
---`;

const BODY = `From an engineering standpoint, the split funnel is straightforward.
We already have feature flags. I can have the soft path branch
behind a flag in two days, behind one prod gate.

But I want to push on Carol's visual-weight hypothesis before we
just defer billing. If the credit-card form is what's scaring
people, splitting funnels won't fix it - the hard path will still
underperform. We should also test a "billing minimized" variant
where the form collapses to a single line until the user opts in.

I disagree with Alice that we don't need an A/B test for the
basic finding. Cohort comparisons are biased - the people who
bypassed step 3 are existing customers with cards on file, they
are not the same population as new signups. We need a proper test.

Also: the activity feed says Dan hasn't dumped yet. We should not
make a decision before he weighs in on the small-business cohort
slice.`;

export function DumpAnatomy({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Act 1 · Dump anatomy
      </p>
      <h2 className="mb-3 text-center text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
        One teammate, one file, one subject
      </h2>
      <p className="mb-10 max-w-3xl text-center text-base text-[var(--text-secondary)]">
        Here's Bob's actual dump from the 2026-04-17 smoke test. Frontmatter carries
        identity and timestamps. Body is whatever the teammate typed into the "My Dump" tab.
      </p>

      <div className="grid w-full max-w-5xl gap-5 md:grid-cols-[auto_1fr]">
        <motion.div
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          initial={{ x: -16, opacity: 0 }}
          animate={isActive ? { x: 0, opacity: 1 } : { x: -16, opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]">
            Frontmatter
          </p>
          <pre className="font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {FRONTMATTER}
          </pre>
          <div className="mt-4 space-y-1.5 text-[11px] text-[var(--text-muted)]">
            <div>
              <span className="text-[var(--accent)]">author</span> — profile UUID (maps to
              vault/profiles.json)
            </div>
            <div>
              <span className="text-[var(--accent)]">created</span> — used to derive the
              dump_id suffix
            </div>
            <div>
              <span className="text-[var(--accent)]">updated</span> — mtime-like; used to
              detect changed dumps for the extract cache
            </div>
          </div>
        </motion.div>

        <motion.div
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          initial={{ x: 16, opacity: 0 }}
          animate={isActive ? { x: 0, opacity: 1 } : { x: 16, opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--info)]">
            Body (what the LLM sees)
          </p>
          <pre className="max-h-[22rem] overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {BODY}
          </pre>
        </motion.div>
      </div>

      <motion.div
        className="mt-8 flex items-center gap-2 text-xs text-[var(--text-muted)]"
        initial={{ opacity: 0 }}
        animate={isActive ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        <span>
          dump_id = <code className="font-mono text-[var(--text-secondary)]">{`<author-uuid>-<iso-timestamp>`}</code>
        </span>
        <span className="mx-2 h-3 w-px bg-[var(--border)]" />
        <span>
          body hashed with BLAKE3 → extractor cache key (R005 in spec-synthesis.md)
        </span>
      </motion.div>
    </motion.div>
  );
}
