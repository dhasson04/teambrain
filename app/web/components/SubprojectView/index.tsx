import { useEffect, useState, type ReactNode } from "react";
import { Tab, Tabs } from "../ui/tabs";

export type SubTabKey = "main" | "dump" | "graph" | "synthesis";

const TABS: { key: SubTabKey; label: string; description: string }[] = [
  { key: "main", label: "Main", description: "Problem statement + materials + activity" },
  { key: "dump", label: "My Dump", description: "Your private brain dump composer" },
  { key: "graph", label: "Connections", description: "Knowledge graph of ideas across the team" },
  { key: "synthesis", label: "Synthesis", description: "Agreements, contradictions, action items" },
];

function readHashTab(): SubTabKey {
  if (typeof window === "undefined") return "main";
  const m = /#(main|dump|graph|synthesis)/.exec(window.location.hash);
  return (m?.[1] as SubTabKey | undefined) ?? "main";
}

interface SubprojectViewProps {
  project: string;
  sub: string;
  renderMain: () => ReactNode;
  renderDump: () => ReactNode;
  renderGraph: () => ReactNode;
  renderSynthesis: () => ReactNode;
}

export function SubprojectView({ project, sub, renderMain, renderDump, renderGraph, renderSynthesis }: SubprojectViewProps) {
  const [active, setActive] = useState<SubTabKey>(readHashTab);

  useEffect(() => {
    const onHash = () => setActive(readHashTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setTab = (next: string) => {
    setActive(next as SubTabKey);
    window.location.hash = next;
  };

  const meta = TABS.find((t) => t.key === active)!;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-[var(--border)] bg-[var(--surface-elevated)] px-5 py-2 text-xs text-[var(--text-muted)]">
        <span>{project}</span>
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
          <path d="M2 1L6 4.5L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span className="text-[var(--text-secondary)]">{sub}</span>
      </div>

      <Tabs value={active} onChange={setTab} layoutId="subproject-tabs">
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key}>
            {t.label}
          </Tab>
        ))}
      </Tabs>

      <div className="flex-1 overflow-y-auto p-6">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          {meta.label}
        </p>
        <p className="mb-5 text-sm text-[var(--text-secondary)]">{meta.description}</p>
        {active === "main" && renderMain()}
        {active === "dump" && renderDump()}
        {active === "graph" && renderGraph()}
        {active === "synthesis" && renderSynthesis()}
      </div>
    </div>
  );
}
