import { useEffect, useRef, useState } from "react";
import { apiClient, type MaterialMeta } from "../../lib/api";
import { MarkdownEditor } from "../editors/MarkdownEditor";
import { Button } from "../ui/button";

interface MainTabProps {
  project: string;
  sub: string;
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
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function MainTab({ project, sub }: MainTabProps) {
  const [body, setBody] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [materials, setMaterials] = useState<MaterialMeta[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const dropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      apiClient.getProblem(project, sub).catch(() => ({ data: null, body: "" })),
      apiClient.listMaterials(project, sub).catch(() => ({ materials: [] as MaterialMeta[] })),
    ]).then(([problem, mats]) => {
      if (cancelled) return;
      setBody(problem.body ?? "");
      setMaterials(mats.materials);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [project, sub]);

  const saveProblem = async (next: string) => {
    if (next === body) return;
    setBody(next);
    try {
      await apiClient.putProblem(project, sub, next);
      setSavedAt(Date.now());
    } catch {
      /* surfaced inline below by lack of savedAt */
    }
  };

  const ingestFile = async (file: File) => {
    const content = await file.text();
    const meta = await apiClient.addMaterial(project, sub, file.name, content);
    setMaterials((m) => [...m, meta]);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!dropRef.current) return;
    dropRef.current.classList.remove("border-[var(--accent)]");
    for (const file of Array.from(e.dataTransfer.files)) {
      if (!/\.(md|txt)$/i.test(file.name)) continue;
      try {
        await ingestFile(file);
      } catch {
        /* ignore individual failures */
      }
    }
  };

  const submitPaste = async () => {
    const fname = pasteName.trim();
    if (!fname || !pasteContent.trim()) return;
    const file = fname.endsWith(".md") || fname.endsWith(".txt") ? fname : `${fname}.md`;
    try {
      const meta = await apiClient.addMaterial(project, sub, file, pasteContent);
      setMaterials((m) => [...m, meta]);
      setPasteOpen(false);
      setPasteName("");
      setPasteContent("");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Problem statement
          </p>
          {savedAt && Date.now() - savedAt < 1500 && (
            <span className="text-[10px] uppercase tracking-wider text-[var(--agreement)]">saved</span>
          )}
        </div>
        {loading ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 text-xs text-[var(--text-muted)]">
            loading…
          </div>
        ) : (
          <MarkdownEditor
            value={body}
            onBlur={(next) => void saveProblem(next)}
            minHeight={140}
          />
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Materials ({materials.length})
          </p>
          <Button size="sm" variant="ghost" onClick={() => setPasteOpen((o) => !o)}>
            {pasteOpen ? "Cancel" : "Paste content"}
          </Button>
        </div>

        {pasteOpen && (
          <div className="mb-3 rounded-lg border border-[var(--border-light)] bg-[var(--surface)] p-3">
            <input
              value={pasteName}
              placeholder="filename.md"
              onChange={(e) => setPasteName(e.target.value)}
              className="mb-2 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            />
            <textarea
              value={pasteContent}
              placeholder="Paste meeting transcript or notes…"
              onChange={(e) => setPasteContent(e.target.value)}
              rows={6}
              className="mb-2 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            />
            <Button size="sm" variant="primary" onClick={() => void submitPaste()}>
              Add material
            </Button>
          </div>
        )}

        <div
          ref={dropRef}
          onDrop={(e) => void onDrop(e)}
          onDragOver={(e) => {
            e.preventDefault();
            dropRef.current?.classList.add("border-[var(--accent)]");
          }}
          onDragLeave={() => dropRef.current?.classList.remove("border-[var(--accent)]")}
          className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-3 transition-colors"
        >
          {materials.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-[var(--text-muted)]">
              Drop .md / .txt files here, or paste content above.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {materials.map((m) => (
                <li key={m.filename} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--surface-elevated)]">
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">md</span>
                  <span className="flex-1 truncate text-[var(--text-secondary)]">{m.title}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{m.added_by}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{relativeTime(m.added_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
