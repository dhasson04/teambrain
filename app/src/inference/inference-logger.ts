import { appendFile } from "node:fs/promises";
import { ensureDir, getVaultRoot, resolveVaultPath } from "../vault/fs-utils";
import { dirname } from "node:path";
import type { InferenceLogger } from "./inference-service";

export interface LogEntry {
  ts: string;
  persona_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  duration_ms: number;
}

function logPath(): string {
  return resolveVaultPath(".synthesis-log.jsonl");
}

/**
 * File-system implementation of InferenceLogger. Appends one JSON line per
 * inference call to vault/.synthesis-log.jsonl. Append is the only operation
 * so it is safe under concurrent writes within a single process.
 */
export const fsInferenceLogger: InferenceLogger = {
  async log(entry) {
    const line: LogEntry = { ts: new Date().toISOString(), ...entry };
    await ensureDir(dirname(logPath()));
    await appendFile(logPath(), `${JSON.stringify(line)}\n`, "utf8");
  },
};

export interface AggregateRow {
  persona_id: string;
  calls: number;
  total_tokens: number;
  avg_duration_ms: number;
}

export async function readLog(): Promise<LogEntry[]> {
  try {
    const raw = await Bun.file(logPath()).text();
    return raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as LogEntry);
  } catch {
    return [];
  }
  void getVaultRoot;
}

export function aggregate24h(entries: LogEntry[], now = Date.now()): AggregateRow[] {
  const cutoff = now - 24 * 60 * 60 * 1000;
  const recent = entries.filter((e) => Date.parse(e.ts) >= cutoff);
  const groups = new Map<string, LogEntry[]>();
  for (const e of recent) {
    if (!groups.has(e.persona_id)) groups.set(e.persona_id, []);
    groups.get(e.persona_id)!.push(e);
  }
  const out: AggregateRow[] = [];
  for (const [persona_id, list] of groups) {
    const total_tokens = list.reduce((s, e) => s + e.prompt_tokens + e.completion_tokens, 0);
    const total_ms = list.reduce((s, e) => s + e.duration_ms, 0);
    out.push({
      persona_id,
      calls: list.length,
      total_tokens,
      avg_duration_ms: Math.round(total_ms / list.length),
    });
  }
  return out;
}
