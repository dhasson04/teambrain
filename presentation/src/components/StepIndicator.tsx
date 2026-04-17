import { motion } from "motion/react";

interface Props {
  current: number;
  total: number;
  onNavigate: (step: number) => void;
}

export function StepIndicator({ current, total, onNavigate }: Props) {
  return (
    <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          onClick={() => onNavigate(i)}
          className="relative flex h-5 w-5 items-center justify-center"
          aria-label={`Go to step ${i + 1}`}
        >
          <motion.div
            className="rounded-full"
            animate={{
              width: i === current ? 10 : 6,
              height: i === current ? 10 : 6,
              backgroundColor: i === current ? "var(--accent)" : "var(--border-light)",
            }}
            transition={{ duration: 0.25 }}
          />
        </button>
      ))}
    </div>
  );
}

export interface SlideProps {
  isActive: boolean;
}
