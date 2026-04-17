import { AppShell } from "./components/AppShell";
import { useBootstrap, useProfilesStore } from "./lib/stores";

function PlaceholderSidebar() {
  return (
    <div className="p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Projects
      </p>
      <p className="text-sm text-[var(--text-secondary)]">
        Sidebar tree lands in T007. Profile picker in T008.
      </p>
    </div>
  );
}

function PlaceholderMain() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-md text-center">
        <h2 className="mb-2 text-2xl font-semibold text-[var(--text-primary)]">
          Pick a subproject
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Subproject 4-tab layout (Main / My Dump / Connections / Synthesis) lands in T009-T013.
        </p>
      </div>
    </div>
  );
}

function BottomBar() {
  const { activeId, profiles } = useProfilesStore();
  const profile = profiles.find((p) => p.id === activeId);
  return (
    <div className="flex w-full items-center justify-between text-xs">
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        {profile ? (
          <>
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ background: profile.color }}
            >
              {profile.display_name[0]?.toUpperCase()}
            </span>
            <span className="text-[var(--text-secondary)]">{profile.display_name}</span>
          </>
        ) : (
          <span>no profile</span>
        )}
      </div>
      <span className="font-mono text-[10px] text-[var(--text-muted)]">teambrain · v0.1.0</span>
    </div>
  );
}

export function App() {
  useBootstrap();
  return (
    <AppShell sidebar={<PlaceholderSidebar />} bottom={<BottomBar />}>
      <PlaceholderMain />
    </AppShell>
  );
}
