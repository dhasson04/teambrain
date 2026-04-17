import { listDumps } from "../vault/dumps";
import { type DumpHashEntry, readLastSynthInput } from "../vault/synthesis";
import { type AttributedIdea, extractAll } from "./extractor";
import type { InferenceService } from "./inference-service";
import { mergeIdeas } from "./merger";
import { renderSynthesis } from "./renderer";

export type PipelineEvent =
  | { type: "started"; subproject: string }
  | { type: "extracting"; dump_id: string; status?: string }
  | { type: "extracted"; dump_id: string; idea_count: number }
  | { type: "cached"; dump_id: string }
  | { type: "merging"; idea_count: number }
  | { type: "rendering"; attempt: number }
  | { type: "validating" }
  | { type: "done"; attempts: number; idea_count: number }
  | { type: "error"; phase: string; message: string };

export interface PipelineRunInput {
  service: InferenceService;
  project: string;
  sub: string;
  modelName: string;
  signal?: AbortSignal;
}

async function currentInputs(project: string, sub: string): Promise<DumpHashEntry[]> {
  const dumps = await listDumps(project, sub, { includeBody: false });
  return dumps.map((d) => ({ dump_id: d.id, hash: d.hash }));
}

/**
 * Full extract -> merge -> render pipeline as an async generator.
 * Honors a caller-supplied AbortSignal between phases for cancellation.
 */
export async function* runPipeline(input: PipelineRunInput): AsyncGenerator<PipelineEvent> {
  yield { type: "started", subproject: input.sub };

  if (input.signal?.aborted) {
    yield { type: "error", phase: "extract", message: "cancelled" };
    return;
  }

  // Extract
  const allIdeas: AttributedIdea[] = [];
  try {
    for await (const ev of extractAll({ service: input.service, project: input.project, sub: input.sub })) {
      if (ev.type === "extracting") yield { type: "extracting", dump_id: ev.dump_id, status: ev.status };
      else if (ev.type === "cached") yield { type: "cached", dump_id: ev.dump_id };
      else if (ev.type === "extracted") {
        const ideas = ev.ideas ?? [];
        allIdeas.push(...ideas);
        yield { type: "extracted", dump_id: ev.dump_id, idea_count: ideas.length };
      } else if (ev.type === "error") {
        yield { type: "error", phase: "extract", message: ev.message ?? "unknown" };
      }
      if (input.signal?.aborted) {
        yield { type: "error", phase: "extract", message: "cancelled" };
        return;
      }
    }
  } catch (e) {
    yield { type: "error", phase: "extract", message: (e as Error).message };
    return;
  }

  if (allIdeas.length === 0) {
    yield { type: "error", phase: "extract", message: "no ideas extracted (no new dumps?)" };
    return;
  }

  if (input.signal?.aborted) {
    yield { type: "error", phase: "merge", message: "cancelled" };
    return;
  }

  // Merge
  yield { type: "merging", idea_count: allIdeas.length };
  try {
    await mergeIdeas({
      service: input.service,
      project: input.project,
      sub: input.sub,
      attributed: allIdeas,
    });
  } catch (e) {
    yield { type: "error", phase: "merge", message: (e as Error).message };
    return;
  }

  if (input.signal?.aborted) {
    yield { type: "error", phase: "render", message: "cancelled" };
    return;
  }

  // Render
  yield { type: "rendering", attempt: 1 };
  const inputs = await currentInputs(input.project, input.sub);
  let renderResult;
  try {
    yield { type: "validating" };
    renderResult = await renderSynthesis({
      service: input.service,
      project: input.project,
      sub: input.sub,
      modelName: input.modelName,
      inputs,
    });
  } catch (e) {
    yield { type: "error", phase: "render", message: (e as Error).message };
    return;
  }

  if (!renderResult.ok) {
    yield {
      type: "error",
      phase: "render",
      message: `validation failed after ${renderResult.attempts} attempts: ${renderResult.validatorComplaints.join("; ")}`,
    };
    return;
  }

  yield { type: "done", attempts: renderResult.attempts, idea_count: allIdeas.length };
}

/**
 * Per-subproject serialization: concurrent calls for the same sub queue;
 * different subs run in parallel. Returns the queue position (0 = running).
 */
export class PipelineQueue {
  private readonly active = new Map<string, Promise<void>>();
  private readonly cancellers = new Map<string, AbortController>();

  has(key: string): boolean {
    return this.active.has(key);
  }

  cancel(key: string): boolean {
    const ac = this.cancellers.get(key);
    if (!ac) return false;
    ac.abort();
    return true;
  }

  /**
   * Run a job for `key`. If a job is already running for that key, wait for it
   * to finish first.
   */
  async run<T>(key: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const prior = this.active.get(key);
    if (prior) await prior.catch(() => {});
    const ac = new AbortController();
    this.cancellers.set(key, ac);
    let resolve!: () => void;
    const sentinel = new Promise<void>((r) => {
      resolve = r;
    });
    this.active.set(key, sentinel);
    try {
      return await fn(ac.signal);
    } finally {
      this.active.delete(key);
      this.cancellers.delete(key);
      resolve();
    }
  }
}
