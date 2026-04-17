import { useEffect, useState, type ReactNode } from "react";

interface AppShellProps {
  sidebar: ReactNode;
  bottom?: ReactNode;
  children: ReactNode;
}

const STORAGE_KEY = "teambrain.sidebar_width";
const MIN = 200;
const MAX = 400;
const DEFAULT = 260;

export function AppShell({ sidebar, bottom, children }: AppShellProps) {
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT;
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(v) && v >= MIN && v <= MAX ? v : DEFAULT;
  });
  const [collapsed, setCollapsed] = useState<boolean>(() => typeof window !== "undefined" && window.innerWidth < 1024);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      if (window.innerWidth < 1024) setCollapsed(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const next = Math.max(MIN, Math.min(MAX, e.clientX));
      setSidebarWidth(next);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  return (
    <div className="flex h-full flex-col bg-[var(--background)]">
      <div className="flex flex-1 overflow-hidden">
        {!collapsed && (
          <aside
            className="relative flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]"
            style={{ width: sidebarWidth }}
          >
            <div className="flex-1 overflow-y-auto">{sidebar}</div>
            <div
              className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-[var(--border-light)]"
              onMouseDown={() => setDragging(true)}
            />
          </aside>
        )}
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
      {bottom && (
        <div className="flex h-12 shrink-0 items-center border-t border-[var(--border)] bg-[var(--surface)] px-4">
          {bottom}
        </div>
      )}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="fixed left-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]"
          aria-label="Open sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
