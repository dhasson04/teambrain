import { useState } from "react";
import { AppShell } from "./components/AppShell";
import { ExplorationView } from "./components/Exploration/ExplorationView";
import { Sidebar } from "./components/Sidebar";
import { SubprojectView } from "./components/SubprojectView";
import { ConnectionsTab } from "./components/SubprojectView/ConnectionsTab";
import { DumpTab } from "./components/SubprojectView/DumpTab";
import { MainTab } from "./components/SubprojectView/MainTab";
import { SynthesisTab } from "./components/SubprojectView/SynthesisTab";
import { SynthControls } from "./components/SynthControls";
import { useBootstrap, useProfilesStore, useProjectsStore } from "./lib/stores";

function EmptyMain() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-md text-center">
        <h2 className="mb-2 text-2xl font-semibold text-[var(--text-primary)]">
          Pick a subproject
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Use the sidebar to expand a project and choose a subproject. The 4-tab view will load
          here.
        </p>
      </div>
    </div>
  );
}

function BottomBar({ project, sub, onSynthesisDone }: { project?: string; sub?: string; onSynthesisDone: () => void }) {
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
      {project && sub ? (
        <SynthControls project={project} sub={sub} onComplete={onSynthesisDone} />
      ) : (
        <span className="font-mono text-[10px] text-[var(--text-muted)]">teambrain · v0.1.0</span>
      )}
    </div>
  );
}

export function App() {
  useBootstrap();
  const { activeProject, activeSub, activeDirection, directionsByProject } = useProjectsStore();
  const [synthVersion, setSynthVersion] = useState(0);

  const directionTab = activeProject && activeDirection
    ? (directionsByProject[activeProject] ?? []).find((d: { tab_id: string }) => d.tab_id === activeDirection)
    : undefined;

  return (
    <AppShell
      sidebar={<Sidebar />}
      bottom={
        <BottomBar
          project={activeProject ?? undefined}
          sub={activeSub ?? undefined}
          onSynthesisDone={() => setSynthVersion((v) => v + 1)}
        />
      }
    >
      {directionTab ? (
        <ExplorationView tab={directionTab} />
      ) : activeProject && activeSub ? (
        <SubprojectView
          project={activeProject}
          sub={activeSub}
          renderMain={() => <MainTab project={activeProject} sub={activeSub} />}
          renderDump={() => <DumpTab project={activeProject} sub={activeSub} />}
          renderGraph={() => <ConnectionsTab key={synthVersion} project={activeProject} sub={activeSub} />}
          renderSynthesis={() => <SynthesisTab key={synthVersion} project={activeProject} sub={activeSub} />}
        />
      ) : (
        <EmptyMain />
      )}
    </AppShell>
  );
}
