import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

const SURFACES = [
  {
    name: "Brain dumps",
    path: "vault/projects/<slug>/subprojects/<slug>/dumps/<author>-<ts>.md",
    api: "POST /api/projects/:project/subprojects/:sub/dumps",
    note: "One markdown file per teammate per subproject. Frontmatter carries author UUID + timestamps.",
    color: "var(--accent)",
  },
  {
    name: "Materials",
    path: "vault/projects/<slug>/subprojects/<slug>/materials/<filename>.md",
    api: "POST /api/projects/:project/subprojects/:sub/materials",
    note: "Meeting transcripts, briefs, prior notes. Pasted via UI or dragged in.",
    color: "var(--info)",
  },
  {
    name: "Problem statement",
    path: "vault/projects/<slug>/subprojects/<slug>/problem.md",
    api: "PUT /api/projects/:project/subprojects/:sub/problem",
    note: "One document per subproject. What the team is trying to figure out.",
    color: "var(--warning)",
  },
];

export function Inputs({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Act 1 · What goes in
      </p>
      <h2 className="mb-3 text-center text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
        Three input surfaces
      </h2>
      <p className="mb-12 max-w-2xl text-center text-base text-[var(--text-secondary)]">
        Every byte the user hands Teambrain lands in one of three places. Two of them don't
        behave the way the README implies — but that reveal comes later.
      </p>

      <div className="grid w-full max-w-6xl grid-cols-3 gap-6">
        {SURFACES.map((s, i) => (
          <motion.div
            key={s.name}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            initial={{ y: 20, opacity: 0 }}
            animate={isActive ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.15 + i * 0.1 }}
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: s.color }}
                aria-hidden
              />
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{s.name}</h3>
            </div>
            <div className="mb-3 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5">
              <code className="font-mono text-[10px] leading-tight text-[var(--text-secondary)]">
                {s.path}
              </code>
            </div>
            <div className="mb-3 rounded-md border border-[var(--border-light)] bg-[var(--surface-elevated)] px-2 py-1.5">
              <code className="font-mono text-[10px] leading-tight text-[var(--accent)]">
                {s.api}
              </code>
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{s.note}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="mt-10 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs text-[var(--text-muted)]"
        initial={{ opacity: 0 }}
        animate={isActive ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
      >
        All three storage formats are plain markdown + JSON. No database. The vault IS the
        source of truth.
      </motion.div>
    </motion.div>
  );
}
