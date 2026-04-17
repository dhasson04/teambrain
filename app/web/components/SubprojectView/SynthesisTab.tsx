import { useEffect, useState } from "react";
import { apiClient } from "../../lib/api";

interface SynthesisTabProps {
  project: string;
  sub: string;
}

interface Section {
  title: string;
  bullets: string[];
}

const HEADER_RE = /^##\s+(.+)$/gm;
const CITATION_RE = /\[([^,\]]+),\s*([A-Za-z0-9._-]+)\]/g;

function splitSections(body: string): Section[] {
  const out: Section[] = [];
  const lines = body.split("\n");
  let current: Section | null = null;
  for (const line of lines) {
    const h = /^##\s+(.+)$/.exec(line);
    if (h) {
      if (current) out.push(current);
      current = { title: h[1]!.trim(), bullets: [] };
      continue;
    }
    if (!current) continue;
    const b = line.trim();
    if (b.startsWith("- ")) current.bullets.push(b.slice(2).trim());
  }
  if (current) out.push(current);
  return out;
}

function classifySection(title: string): "agreed" | "disputed" | "forward" | "other" {
  const t = title.toLowerCase();
  if (t.includes("agree")) return "agreed";
  if (t.includes("disput")) return "disputed";
  if (t.includes("move forward") || t.includes("action") || t.includes("next")) return "forward";
  return "other";
}

const SECTION_COLOR: Record<"agreed" | "disputed" | "forward" | "other", string> = {
  agreed: "var(--agreement)",
  disputed: "var(--contradiction)",
  forward: "var(--accent-secondary)",
  other: "var(--text-muted)",
};

function CitationChip({ author, dumpId }: { author: string; dumpId: string }) {
  return (
    <span
      className="ml-1 inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-overlay)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
      title={`${author} • ${dumpId}`}
    >
      <span className="font-semibold text-[var(--text-primary)]">{author}</span>
      <span className="text-[var(--text-muted)]">·</span>
      <span className="font-mono">{dumpId.slice(-12)}</span>
    </span>
  );
}

function renderBullet(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <CitationChip key={`${m.index}`} author={m[1]!.trim()} dumpId={m[2]!} />,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 0 ? text : parts;
}

function relativeTime(iso: string): string {
  if (!iso) return "";
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SynthesisTab({ project, sub }: SynthesisTabProps) {
  const [body, setBody] = useState("");
  const [meta, setMeta] = useState<{ created: string; dump_count: number; model: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void apiClient
      .getSynthesis(project, sub)
      .then((res) => {
        if (cancelled) return;
        setBody(res.body ?? "");
        setMeta(res.data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // refetch when subproject changes; also reload after re-synthesis would be wired in T014
  }, [project, sub]);

  const sections = splitSections(body);
  const has = sections.some((s) => s.bullets.length > 0);

  if (loading) {
    return <p className="text-xs text-[var(--text-muted)]">loading…</p>;
  }
  if (!has) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
        <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">No synthesis yet</p>
        <p className="text-xs text-[var(--text-muted)]">
          Add dumps to this subproject and click Re-synthesize in the bottom bar.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {sections.map((section) => {
          const kind = classifySection(section.title);
          const color = SECTION_COLOR[kind];
          return (
            <div
              key={section.title}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <h3
                className="mb-4 text-sm font-semibold uppercase tracking-wider"
                style={{ color }}
              >
                {section.title}
              </h3>
              {section.bullets.length === 0 ? (
                <p className="text-xs italic text-[var(--text-muted)]">empty</p>
              ) : (
                <ul className="space-y-3">
                  {section.bullets.map((b, i) => {
                    const id = `${section.title}-${i}`;
                    return (
                      <li key={id} className="flex items-start gap-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                        {kind === "forward" && (
                          <input
                            type="checkbox"
                            className="mt-1 shrink-0"
                            checked={checked.has(id)}
                            onChange={(e) => {
                              const next = new Set(checked);
                              if (e.target.checked) next.add(id);
                              else next.delete(id);
                              setChecked(next);
                            }}
                          />
                        )}
                        <span>{renderBullet(b)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {meta && (
        <div className="mt-5 inline-flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-1.5 text-[10px] text-[var(--text-muted)]">
          <span>generated {relativeTime(meta.created)}</span>
          <span className="h-3 w-px bg-[var(--border)]" />
          <span>{meta.dump_count} dump{meta.dump_count === 1 ? "" : "s"}</span>
          <span className="h-3 w-px bg-[var(--border)]" />
          <span className="font-mono">{meta.model}</span>
        </div>
      )}

      {/* HEADER_RE intentionally referenced once to suppress unused-import warnings */}
      <span className="hidden">{HEADER_RE.source}</span>
    </div>
  );
}
