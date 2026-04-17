import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import { createProfile, loadProjects, selectProfile, useProfilesStore } from "../../lib/stores";

function Avatar({ name, color, size = 24 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ background: color, width: size, height: size }}
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}

export function ProfilePicker() {
  const { profiles, activeId } = useProfilesStore();
  const active = profiles.find((p) => p.id === activeId);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface)] p-2">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--surface-elevated)]">
            {active ? (
              <>
                <Avatar name={active.display_name} color={active.color} />
                <span className="flex-1 truncate text-[var(--text-primary)]">{active.display_name}</span>
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className="text-[var(--text-muted)]">
                  <path d="M1 6L4.5 2L8 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </>
            ) : (
              <span className="text-[var(--text-muted)]">No profile</span>
            )}
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={6}
            className="z-50 w-64 rounded-lg border border-[var(--border-light)] bg-[var(--surface-elevated)] p-1 shadow-lg"
          >
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Switch profile
            </div>
            {profiles.map((p) => (
              <DropdownMenu.Item
                key={p.id}
                onSelect={() => {
                  selectProfile(p.id);
                  void loadProjects();
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] outline-none hover:bg-[var(--background)] hover:text-[var(--text-primary)] data-[highlighted]:bg-[var(--background)] data-[highlighted]:text-[var(--text-primary)]"
              >
                <Avatar name={p.display_name} color={p.color} />
                <span className="flex-1 truncate">{p.display_name}</span>
                {p.id === activeId && (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="text-[var(--accent)]">
                    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </DropdownMenu.Item>
            ))}

            <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />

            {creating ? (
              <div className="p-1">
                <input
                  autoFocus
                  value={draft}
                  placeholder="Profile name"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && draft.trim()) {
                      void createProfile(draft.trim()).then(() => loadProjects());
                      setDraft("");
                      setCreating(false);
                    }
                    if (e.key === "Escape") {
                      setDraft("");
                      setCreating(false);
                    }
                  }}
                  className="w-full rounded-md border border-[var(--accent)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none"
                />
              </div>
            ) : (
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  setCreating(true);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-muted)] outline-none data-[highlighted]:bg-[var(--background)] data-[highlighted]:text-[var(--text-primary)]"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                New profile
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
