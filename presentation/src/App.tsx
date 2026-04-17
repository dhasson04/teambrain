import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { StepIndicator } from "./components/StepIndicator";
import { Title } from "./components/slides/Title";
import { Problem } from "./components/slides/Problem";
import { Vision } from "./components/slides/Vision";
import { UserFlow } from "./components/slides/UserFlow";
import { SubprojectLayout } from "./components/slides/SubprojectLayout";
import { Pipeline } from "./components/slides/Pipeline";
import { KnowledgeGraph } from "./components/slides/KnowledgeGraph";
import { SynthesisOutput } from "./components/slides/SynthesisOutput";
import { DualAgent } from "./components/slides/DualAgent";
import { Stack } from "./components/slides/Stack";
import { Hardware } from "./components/slides/Hardware";

const SLIDES = [
  Title,
  Problem,
  Vision,
  UserFlow,
  SubprojectLayout,
  Pipeline,
  KnowledgeGraph,
  SynthesisOutput,
  DualAgent,
  Stack,
  Hardware,
];

export function App() {
  const [step, setStep] = useState(0);

  const navigate = useCallback((dir: "next" | "prev" | number) => {
    if (typeof dir === "number") {
      setStep(dir);
    } else if (dir === "next") {
      setStep((s) => Math.min(s + 1, SLIDES.length - 1));
    } else {
      setStep((s) => Math.max(s - 1, 0));
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        navigate("next");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigate("prev");
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        navigate(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const Current = SLIDES[step];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--background)]">
      <AnimatePresence mode="wait">
        <Current key={step} isActive />
      </AnimatePresence>

      {step > 0 && (
        <button
          onClick={() => navigate("prev")}
          className="fixed bottom-8 left-8 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:border-[var(--border-light)]"
          aria-label="Previous"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {step < SLIDES.length - 1 && (
        <button
          onClick={() => navigate("next")}
          className="fixed bottom-8 right-8 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:border-[var(--border-light)]"
          aria-label="Next"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <StepIndicator current={step} total={SLIDES.length} onNavigate={navigate} />
    </div>
  );
}
