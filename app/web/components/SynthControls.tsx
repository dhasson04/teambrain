import { useEffect, useState } from "react";
import { useSSE } from "../lib/use-sse";
import { Button } from "./ui/button";

interface SynthControlsProps {
  project: string;
  sub: string;
  /** Called when synthesis completes successfully so the Synthesis tab can refetch. */
  onComplete?: () => void;
}

interface PhaseEvent {
  type: string;
  dump_id?: string;
  phase?: string;
  message?: string;
  attempts?: number;
  idea_count?: number;
}

const PHASE_LABEL: Record<string, string> = {
  started: "queued",
  extracting: "extracting",
  cached: "extracting",
  extracted: "extracting",
  merging: "merging",
  rendering: "rendering",
  validating: "validating",
};

export function SynthControls({ project, sub, onComplete }: SynthControlsProps) {
  const [phase, setPhase] = useState<string>("");
  const [doneAt, setDoneAt] = useState<number | null>(null);

  const sse = useSSE({
    url: `/api/projects/${project}/subprojects/${sub}/synthesize`,
    method: "POST",
    headers: { "X-Profile-Id": localStorage.getItem("teambrain.profile_id") ?? "" },
    onEvent: (ev) => {
      const data = ev.data as PhaseEvent;
      const label = PHASE_LABEL[ev.event];
      if (label) setPhase(label);
      if (ev.event === "done") {
        setDoneAt(Date.now());
        onComplete?.();
        setTimeout(() => setDoneAt(null), 1500);
      }
      if (ev.event === "error") setPhase(`error: ${data.message ?? "unknown"}`);
    },
  });

  useEffect(() => {
    if (sse.status === "idle" || sse.status === "done") setPhase("");
  }, [sse.status]);

  const running = sse.status === "streaming" || sse.status === "connecting";

  return (
    <div className="flex items-center gap-3">
      {running && (
        <span className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span
            className="pulse-ring h-2 w-2 rounded-full"
            style={{ background: "var(--accent)" }}
          />
          {phase || "starting"}…
        </span>
      )}
      {doneAt && Date.now() - doneAt < 1500 && (
        <span className="text-xs text-[var(--agreement)]">synthesis complete</span>
      )}
      {sse.error && !running && (
        <span className="max-w-[280px] truncate text-xs text-[var(--contradiction)]" title={sse.error.message}>
          {sse.error.message}
        </span>
      )}
      {running ? (
        <Button size="sm" variant="danger" onClick={() => sse.stop()}>
          Stop
        </Button>
      ) : (
        <Button size="sm" variant="primary" onClick={() => sse.start()}>
          Re-synthesize
        </Button>
      )}
    </div>
  );
}
