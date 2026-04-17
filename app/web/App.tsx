import { AppShell } from "./components/AppShell";
import { Sidebar } from "./components/Sidebar";
import { SubprojectView } from "./components/SubprojectView";
import { ConnectionsTab } from "./components/SubprojectView/ConnectionsTab";
import { DumpTab } from "./components/SubprojectView/DumpTab";
import { MainTab } from "./components/SubprojectView/MainTab";
import { useBootstrap, useProjectsStore } from "./lib/stores";

function PlaceholderPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center">
      <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="text-xs text-[var(--text-muted)]">{body}</p>
    </div>
  );
}

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

export function App() {
  useBootstrap();
  const { activeProject, activeSub } = useProjectsStore();

  return (
    <AppShell sidebar={<Sidebar />}>
      {activeProject && activeSub ? (
        <SubprojectView
          project={activeProject}
          sub={activeSub}
          renderMain={() => <MainTab project={activeProject} sub={activeSub} />}
          renderDump={() => <DumpTab project={activeProject} sub={activeSub} />}
          renderGraph={() => <ConnectionsTab project={activeProject} sub={activeSub} />}
          renderSynthesis={() => (
            <PlaceholderPanel title="Synthesis tab" body="Agreed / Disputed / Move forward sections land in T013." />
          )}
        />
      ) : (
        <EmptyMain />
      )}
    </AppShell>
  );
}
