import { useState } from "react";
import {
  createProject,
  createSubproject,
  selectSubproject,
  toggleExpanded,
  useProjectsStore,
} from "../../lib/stores";
import { cn } from "../../lib/utils";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 9 9"
      fill="none"
      className={cn("transition-transform", open && "rotate-90")}
    >
      <path d="M2 1L6 4.5L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InlineCreate({ placeholder, onCreate, indent = false }: { placeholder: string; onCreate: (name: string) => void; indent?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)]",
          indent && "ml-3 w-[calc(100%-12px)]",
        )}
      >
        <PlusIcon />
        <span>{placeholder}</span>
      </button>
    );
  }
  return (
    <div className={cn("px-1", indent && "ml-3")}>
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value.trim()) onCreate(value.trim());
          setValue("");
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (value.trim()) onCreate(value.trim());
            setValue("");
            setEditing(false);
          }
          if (e.key === "Escape") {
            setValue("");
            setEditing(false);
          }
        }}
        className="w-full rounded-md border border-[var(--accent)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none"
      />
    </div>
  );
}

export function ProjectTree() {
  const { projects, subprojectsByProject, expanded, activeSub, activeProject } = useProjectsStore();

  return (
    <nav className="p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Projects
        </span>
      </div>

      <div className="space-y-0.5">
        {projects.length === 0 && (
          <p className="px-2 py-2 text-xs text-[var(--text-muted)]">
            No projects yet. Create one below.
          </p>
        )}

        {projects.map((p) => {
          const open = !!expanded[p.slug];
          const subs = subprojectsByProject[p.slug] ?? [];
          return (
            <div key={p.slug}>
              <button
                onClick={() => toggleExpanded(p.slug)}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-elevated)]"
              >
                <span className="text-[var(--text-muted)]">
                  <Chevron open={open} />
                </span>
                <span className="flex-1 truncate font-medium">{p.display_name}</span>
              </button>

              {open && (
                <div className="ml-4 mt-0.5 flex flex-col gap-0.5">
                  {subs.map((s) => {
                    const isActive = activeProject === p.slug && activeSub === s.slug;
                    return (
                      <button
                        key={s.slug}
                        onClick={() => selectSubproject(p.slug, s.slug)}
                        className={cn(
                          "rounded-md px-2 py-1 text-left text-xs transition-colors",
                          isActive
                            ? "bg-[var(--accent-tint)] text-[var(--text-primary)]"
                            : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)]",
                        )}
                      >
                        {s.display_name}
                      </button>
                    );
                  })}
                  <InlineCreate
                    placeholder="New subproject"
                    indent
                    onCreate={(name) => {
                      void createSubproject(p.slug, name);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}

        <InlineCreate
          placeholder="New project"
          onCreate={(name) => {
            void createProject(name);
          }}
        />
      </div>
    </nav>
  );
}
