import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aggregate24h, fsInferenceLogger, type LogEntry, readLog } from "./inference-logger";

let tmpRoot: string;
let originalVault: string | undefined;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "teambrain-log-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = tmpRoot;
});

afterEach(async () => {
  if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
  else process.env["TEAMBRAIN_VAULT"] = originalVault;
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("fsInferenceLogger", () => {
  test("appends one JSON line per call", async () => {
    await fsInferenceLogger.log({
      persona_id: "synthesis",
      model: "gemma3:4b",
      prompt_tokens: 100,
      completion_tokens: 25,
      duration_ms: 1234,
    });
    await fsInferenceLogger.log({
      persona_id: "exploration",
      model: "gemma3:4b",
      prompt_tokens: 50,
      completion_tokens: 80,
      duration_ms: 900,
    });
    const raw = await readFile(`${tmpRoot}/.synthesis-log.jsonl`, "utf8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(2);
    const parsed = lines.map((l) => JSON.parse(l) as LogEntry);
    expect(parsed[0]?.persona_id).toBe("synthesis");
    expect(parsed[1]?.persona_id).toBe("exploration");
  });
});

describe("readLog + aggregate24h", () => {
  test("aggregates calls per persona within last 24h", async () => {
    await fsInferenceLogger.log({ persona_id: "synthesis", model: "m", prompt_tokens: 10, completion_tokens: 5, duration_ms: 100 });
    await fsInferenceLogger.log({ persona_id: "synthesis", model: "m", prompt_tokens: 20, completion_tokens: 10, duration_ms: 300 });
    await fsInferenceLogger.log({ persona_id: "exploration", model: "m", prompt_tokens: 1, completion_tokens: 1, duration_ms: 50 });

    const entries = await readLog();
    const rows = aggregate24h(entries);
    const synth = rows.find((r) => r.persona_id === "synthesis");
    expect(synth?.calls).toBe(2);
    expect(synth?.total_tokens).toBe(45);
    expect(synth?.avg_duration_ms).toBe(200);
  });

  test("excludes entries older than 24h", async () => {
    const oldTs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const newTs = new Date().toISOString();
    const entries: LogEntry[] = [
      { ts: oldTs, persona_id: "synthesis", model: "m", prompt_tokens: 999, completion_tokens: 999, duration_ms: 999 },
      { ts: newTs, persona_id: "synthesis", model: "m", prompt_tokens: 5, completion_tokens: 5, duration_ms: 100 },
    ];
    const rows = aggregate24h(entries);
    expect(rows[0]?.calls).toBe(1);
    expect(rows[0]?.total_tokens).toBe(10);
  });
});
