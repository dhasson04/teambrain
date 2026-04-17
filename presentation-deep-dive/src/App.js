import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { StepIndicator } from "./components/StepIndicator";
import { Title } from "./components/slides/Title";
const SLIDES = [
    Title,
    // Acts 1-6 slotted in by T008 once T002..T007 land.
];
export function App() {
    const [step, setStep] = useState(0);
    const navigate = useCallback((dir) => {
        if (typeof dir === "number") {
            setStep(dir);
        }
        else if (dir === "next") {
            setStep((s) => Math.min(s + 1, SLIDES.length - 1));
        }
        else {
            setStep((s) => Math.max(s - 1, 0));
        }
    }, []);
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
                e.preventDefault();
                navigate("next");
            }
            else if (e.key === "ArrowLeft") {
                e.preventDefault();
                navigate("prev");
            }
            else if (e.key === "r" || e.key === "R") {
                e.preventDefault();
                navigate(0);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [navigate]);
    const Current = SLIDES[step];
    return (_jsxs("div", { className: "relative h-screen w-screen overflow-hidden bg-[var(--background)]", children: [_jsx(AnimatePresence, { mode: "wait", children: _jsx(Current, { isActive: true }, step) }), step > 0 && (_jsx("button", { onClick: () => navigate("prev"), className: "fixed bottom-8 left-8 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:border-[var(--border-light)]", "aria-label": "Previous", children: _jsx("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", children: _jsx("path", { d: "M10 3L5 8L10 13", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }) }) })), step < SLIDES.length - 1 && (_jsx("button", { onClick: () => navigate("next"), className: "fixed bottom-8 right-8 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:border-[var(--border-light)]", "aria-label": "Next", children: _jsx("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", children: _jsx("path", { d: "M6 3L11 8L6 13", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }) }) })), _jsx(StepIndicator, { current: step, total: SLIDES.length, onNavigate: navigate })] }));
}
