import { useEffect, useState } from "react";
import { apiClient, type DumpFull } from "../../lib/api";
import { MarkdownEditor } from "../editors/MarkdownEditor";
import { Button } from "../ui/button";

interface DumpTabProps {
  project: string;
  sub: string;
}

const NEW_DRAFT = "new";

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

export function DumpTab({ project, sub }: DumpTabProps) {
  const [dumps, setDumps] = useState<DumpFull[]>([]);
  const [editingId, setEditingId] = useState<string>(NEW_DRAFT);
  const [body, setBody] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEditingId(NEW_DRAFT);
    setBody("");
    void apiClient
      .listMyDumps(project, sub)
      .then((res) => {
        if (cancelled) return;
        const sorted = [...res.dumps].sort((a, b) => (a.created < b.created ? 1 : -1));
        setDumps(sorted);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDumps([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, sub]);

  const onSave = async () => {
    if (!body.trim()) return;
    if (editingId === NEW_DRAFT) {
      const dump = await apiClient.createDump(project, sub, body);
      setDumps((d) => [{ ...dump, body }, ...d]);
      setEditingId(dump.id);
      setSavedAt(Date.now());
    } else {
      const dump = await apiClient.patchDump(project, sub, editingId, body);
      setDumps((d) => d.map((x) => (x.id === editingId ? { ...dump, body } : x)));
      setSavedAt(Date.now());
    }
  };

  const startNew = () => {
    setEditingId(NEW_DRAFT);
    setBody("");
  };

  const openExisting = (id: string) => {
    const d = dumps.find((x) => x.id === id);
    if (!d) return;
    setEditingId(id);
    setBody(d.body ?? "");
  };

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[2fr_1fr]">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            {editingId === NEW_DRAFT ? "New dump" : "Editing"}
            <span className="ml-2 text-[var(--text-muted)]">private to you</span>
          </p>
          <div className="flex items-center gap-2">
            {savedAt && Date.now() - savedAt < 1500 && (
              <span className="text-[10px] uppercase tracking-wider text-[var(--agreement)]">saved</span>
            )}
            {editingId !== NEW_DRAFT && (
              <Button size="sm" variant="ghost" onClick={startNew}>
                Start new
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => void onSave()}>
              Save dump
            </Button>
          </div>
        </div>

        <MarkdownEditor
          value={body}
          onChange={(next) => setBody(next)}
          minHeight={320}
          placeholder="Speak your mind. This stays private."
        />
      </section>

      <section>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Your past dumps ({dumps.length})
        </p>
        {loading ? (
          <p className="px-2 text-xs text-[var(--text-muted)]">loading…</p>
        ) : dumps.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-center text-xs text-[var(--text-muted)]">
            Nothing yet. Speak your mind. This stays private.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {dumps.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => openExisting(d.id)}
                  className={
                    "block w-full rounded-md border px-3 py-2 text-left transition-colors " +
                    (editingId === d.id
                      ? "border-[var(--accent)] bg-[var(--accent-tint)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-light)]")
                  }
                >
                  <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                    <span className="font-mono">{d.id.slice(0, 24)}</span>
                    <span>{relativeTime(d.updated || d.created)}</span>
                  </div>
                  <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">
                    {(d.body ?? "").slice(0, 140)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
