import { jsx as _jsx } from "react/jsx-runtime";
import { motion } from "motion/react";
export function StepIndicator({ current, total, onNavigate }) {
    return (_jsx("div", { className: "fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5", children: Array.from({ length: total }, (_, i) => (_jsx("button", { onClick: () => onNavigate(i), className: "relative flex h-5 w-5 items-center justify-center", "aria-label": `Go to step ${i + 1}`, children: _jsx(motion.div, { className: "rounded-full", animate: {
                    width: i === current ? 10 : 6,
                    height: i === current ? 10 : 6,
                    backgroundColor: i === current ? "var(--accent)" : "var(--border-light)",
                }, transition: { duration: 0.25 } }) }, i))) }));
}
