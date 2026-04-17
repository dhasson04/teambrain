import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { SlideProps } from "../StepIndicator";

const LAYERS = [
  {
    layer: "Frontend",
    items: ["Vite", "React 19 + TypeScript", "Tailwind v4", "shadcn/ui", "react-flow + d3-force"],
  },
  {
    layer: "Backend",
    items: ["Bun runtime", "Hono web framework", "Zod validation", "chokidar file watcher"],
  },
  {
    layer: "Storage",
    items: ["Plain markdown + JSON in ./vault/", "BLAKE3 chunk hashing", "no DB for POC"],
  },
  {
    layer: "Inference",
    items: ["Ollama at 127.0.0.1:11434", "gemma4:4b default", "gemma3:12b config swap"],
  },
  {
    layer: "Sync (v2)",
    items: ["git push/pull per user", "post-merge hook → re-index", "Tailscale optional"],
  },
];

const COMMANDS = [
  { c: "git clone <repo> teambrain", d: "Friend's repo" },
  { c: "cd teambrain && bun install", d: "~10 seconds" },
  { c: "ollama pull gemma3:4b", d: "one time, ~3GB" },
  { c: "bun run dev", d: "opens localhost:5173" },
];

export function Stack({ isActive }: SlideProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setPhase(0);
      return;
    }
    const t = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1100),
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
        Tech stack
      </p>
      <h2 className="mb-3 text-center text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
        Boring, fast, local
      </h2>
      <p className="mb-10 max-w-2xl text-center text-base text-[var(--text-secondary)]">
        Every choice optimizes for clone-and-run. No hosted services, no API keys, no auth provider.
      </p>

      <div className="grid w-full max-w-6xl grid-cols-2 gap-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          transition={{ duration: 0.5 }}
          className="space-y-3"
        >
          {LAYERS.map((l, i) => (
            <motion.div
              key={l.layer}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
              initial={{ opacity: 0, y: 8 }}
              animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.3, delay: i * 0.08 }}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--accent)]">
                  {l.layer}
                </h3>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">
                  layer {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {l.items.map((item) => (
                  <span
                    key={item}
                    className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col gap-4"
        >
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--text-muted)] opacity-50" />
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--text-muted)] opacity-50" />
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--text-muted)] opacity-50" />
              </div>
              <span className="font-mono text-[10px] text-[var(--text-muted)]">~/teambrain</span>
            </div>
            <div className="space-y-2.5 p-4">
              {COMMANDS.map((cmd, i) => (
                <motion.div
                  key={cmd.c}
                  className="flex items-center justify-between"
                  initial={{ opacity: 0 }}
                  animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.15 }}
                >
                  <code className="font-mono text-xs text-[var(--text-primary)]">
                    <span className="text-[var(--accent)]">$</span> {cmd.c}
                  </code>
                  <span className="text-[10px] text-[var(--text-muted)]">{cmd.d}</span>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Vault structure
            </p>
            <pre className="font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">{`vault/
  projects/
    acme-corp/
      _meta.json
      subprojects/
        q2-strategy/
          problem.md
          materials/
          dumps/<author>-<ts>.md
          ideas/{ideas,connections}.json
          synthesis/latest.md
prompts/
  synthesis.md
  exploration.md`}</pre>
          </div>

          <div className="flex items-center gap-3 rounded-md border border-[var(--accent)] bg-[var(--accent-tint)] px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
              Bonus
            </span>
            <span className="text-xs text-[var(--text-secondary)]">
              Vault is just markdown. Power users can open it in Obsidian or VS Code.
            </span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
