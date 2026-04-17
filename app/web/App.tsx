import { useEffect, useState } from "react";

interface Health {
  ok: boolean;
  service: string;
  ollama: "ok" | "unavailable";
  model_loaded: string | null;
}

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<Health>)
      .then(setHealth)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center px-8">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border-light)] bg-[var(--surface-elevated)]">
        <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
          <circle cx="8" cy="10" r="3" stroke="var(--accent)" strokeWidth="1.6" />
          <circle cx="24" cy="10" r="3" stroke="var(--accent)" strokeWidth="1.6" />
          <circle cx="16" cy="22" r="3" stroke="var(--accent-secondary)" strokeWidth="1.6" />
          <line x1="8" y1="10" x2="16" y2="22" stroke="var(--border-light)" strokeWidth="1.2" />
          <line x1="24" y1="10" x2="16" y2="22" stroke="var(--border-light)" strokeWidth="1.2" />
        </svg>
      </div>

      <h1 className="mb-3 text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
        Teambrain
      </h1>
      <p className="mb-8 max-w-md text-center text-[var(--text-secondary)]">
        UI scaffolding ready. App shell + sidebar + 4-tab layout land in subsequent tasks.
      </p>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 font-mono text-xs text-[var(--text-secondary)]">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Backend status
        </div>
        {error && <div className="text-[var(--contradiction)]">{error}</div>}
        {!error && !health && <div className="text-[var(--text-muted)]">checking…</div>}
        {health && (
          <div className="space-y-1">
            <div>
              <span className="text-[var(--text-muted)]">service</span>{" "}
              <span className="text-[var(--text-primary)]">{health.service}</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">ollama</span>{" "}
              <span style={{ color: health.ollama === "ok" ? "var(--agreement)" : "var(--warning)" }}>
                {health.ollama}
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">model</span>{" "}
              <span className="text-[var(--accent)]">{health.model_loaded ?? "(none)"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
