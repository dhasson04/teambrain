import { motion } from "motion/react";
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "../../lib/utils";

interface TabsContextValue {
  value: string;
  onChange: (next: string) => void;
  layoutId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProps {
  value: string;
  onChange: (next: string) => void;
  layoutId?: string;
  className?: string;
  children: ReactNode;
}

export function Tabs({ value, onChange, layoutId = "tabs-underline", className, children }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onChange, layoutId }}>
      <div className={cn("flex border-b border-[var(--border)]", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabProps {
  value: string;
  children: ReactNode;
}

export function Tab({ value, children }: TabProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tab must be used inside Tabs");
  const isActive = ctx.value === value;
  return (
    <button
      onClick={() => ctx.onChange(value)}
      className={cn(
        "relative px-5 py-3 text-sm transition-colors",
        isActive ? "font-semibold text-[var(--text-primary)]" : "font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
      )}
    >
      {children}
      {isActive && (
        <motion.div
          layoutId={ctx.layoutId}
          className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[var(--accent)]"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
    </button>
  );
}
