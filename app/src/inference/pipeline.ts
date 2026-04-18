import { loadConfig } from "../server/config";
import { listDumps } from "../vault/dumps";
import { readIdeasBundle, writeIdeasBundle } from "../vault/ideas";
import { type DumpHashEntry, readLastSynthInput } from "../vault/synthesis";
import { type AttributedIdea, extractAll } from "./extractor";
import type { InferenceService } from "./inference-service";
import { mergeIdeas } from "./merger";
import { findContradictionCandidates } from "./nli";
import { renderSynthesis } from "./renderer";

export type PipelineEvent =
  | { type: "started"; subproject: string }
  | { type: "extracting"; dump_id: string; status?: string }
  | { type: "extracted"; dump_id: string; idea_count: number }
  | { type: "cached"; dump_id: string }
  | { type: "merging"; idea_count: number }
  | { type: "rendering"; attempt: number }
  | { type: "validating" }
  | { type: "contradict_scan"; pair_count: number }
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

  // Fall through to NLI + render even when no new dumps are extracted,
  // as long as existing ideas are on disk. This handles the case where
  // a new capability (e.g. features.nli_contradict) is turned on against
  // a subproject whose extract+merge already ran. The merger below is a
  // no-op when passed an empty AttributedIdea[], so ideas.json is
  // preserved verbatim.
  if (allIdeas.length === 0) {
    const existing = await readIdeasBundle(input.project, input.sub).catch(() => null);
    if (!existing || existing.ideas.ideas.length === 0) {
      yield { type: "error", phase: "extract", message: "no ideas extracted (no new dumps?)" };
      return;
    }
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

  // Contradiction scan (R003 wiring — previously missing): run NLI on
  // cross-cluster pairs where the two endpoints are authored by different
  // profiles. Skip pairs with null cluster_id on either side (unclustered
  // ideas are too low-signal to be worth the LLM budget). Hard cap at 30
  // pairs per run to bound latency; gemma3:4b at ~3.6s/pair × 2 directions.
  if (loadConfig().features?.nli_contradict !== false) {
    try {
      const bundle = await readIdeasBundle(input.project, input.sub);
      const pairs: Array<{ idea_a_id: string; idea_a_text: string; idea_b_id: string; idea_b_text: string }> = [];
      const ideas = bundle.ideas.ideas;
      const authorsOf = (ideaId: string): Set<string> =>
        new Set((bundle.attribution[ideaId] ?? []).map((e) => e.author));
      outer: for (let i = 0; i < ideas.length; i++) {
        const a = ideas[i]!;
        if (a.cluster_id == null) continue;
        for (let j = i + 1; j < ideas.length; j++) {
          const b = ideas[j]!;
          if (b.cluster_id == null || a.cluster_id === b.cluster_id) continue;
          const aa = authorsOf(a.idea_id);
          const bb = authorsOf(b.idea_id);
          let sharedAuthor = false;
          for (const x of aa) if (bb.has(x)) { sharedAuthor = true; break; }
          if (sharedAuthor) continue;
          pairs.push({ idea_a_id: a.idea_id, idea_a_text: a.statement, idea_b_id: b.idea_id, idea_b_text: b.statement });
          if (pairs.length >= 30) break outer;
        }
      }
      yield { type: "contradict_scan", pair_count: pairs.length };
      const confirmed = await findContradictionCandidates(input.service, pairs);
      if (confirmed.length > 0) {
        const nextEdge = bundle.connections.connections.length;
        for (let k = 0; k < confirmed.length; k++) {
          const c = confirmed[k]!;
          bundle.connections.connections.push({
            edge_id: `c${nextEdge + k + 1}`,
            from_idea: c.idea_a_id,
            to_idea: c.idea_b_id,
            kind: "contradict",
            weight: c.scores_ab.contradiction,
          });
        }
        await writeIdeasBundle(input.project, input.sub, bundle);
      }
    } catch (e) {
      // NLI failure should never block render — log + continue.
      // eslint-disable-next-line no-console
      console.warn(`[pipeline] NLI scan failed: ${(e as Error).message}`);
    }
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
