import { useState } from "react";
import {
  closeDirection,
  createDirection,
  selectDirection,
  useProjectsStore,
} from "../../lib/stores";
import { cn } from "../../lib/utils";

interface DirectionListProps {
  project: string;
}

export function DirectionList({ project }: DirectionListProps) {
  const { directionsByProject, activeDirection } = useProjectsStore();
  const directions = directionsByProject[project] ?? [];
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-[var(--border)] pl-2">
      <p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Directions
      </p>
      {directions.map((d) => {
        const isActive = activeDirection === d.tab_id;
        return (
          <div key={d.tab_id} className="group flex items-center gap-1">
            <button
              onClick={() => selectDirection(project, d.tab_id)}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-left text-xs transition-colors",
                isActive
                  ? "bg-[var(--accent-secondary-tint)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)]",
              )}
            >
              {d.name}
            </button>
            <button
              onClick={() => {
                if (confirm(`Close direction "${d.name}"? History stays on disk.`)) {
                  closeDirection(project, d.tab_id);
                }
              }}
              className="opacity-0 transition-opacity hover:text-[var(--contradiction)] group-hover:opacity-100"
              aria-label="Close direction"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        );
      })}

      {creating ? (
        <div className="px-1 py-1">
          <input
            autoFocus
            value={draft}
            placeholder="Direction name"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft.trim()) {
                const tab = createDirection(project, draft.trim());
                selectDirection(project, tab.tab_id);
              }
              setDraft("");
              setCreating(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                const tab = createDirection(project, draft.trim());
                selectDirection(project, tab.tab_id);
                setDraft("");
                setCreating(false);
              }
              if (e.key === "Escape") {
                setDraft("");
                setCreating(false);
              }
            }}
            className="w-full rounded-md border border-[var(--accent-secondary)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none"
          />
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--accent-secondary)]"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          New direction
        </button>
      )}
    </div>
  );
}
