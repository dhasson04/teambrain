import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveVaultPath } from "../vault/fs-utils";
import { initVault } from "../vault/init";
import { createDump } from "../vault/dumps";
import { writeIdeasBundle } from "../vault/ideas";
import { addProfile, makeProfile } from "../vault/profiles";
import { createProject } from "../vault/projects";
import { createSubproject } from "../vault/subprojects";
import { InferenceService, type InferenceEvent, type RunInput } from "./inference-service";
import { PromptRegistry } from "./prompt-registry";
import { renderSynthesis } from "./renderer";

let dir: string;
let originalVault: string | undefined;
let dumpId: string;

class FakeService extends InferenceService {
  attempts = 0;
  constructor(private readonly responses: string[]) {
    super({
      registry: { get: () => ({}) } as unknown as PromptRegistry,
      ollama_url: "http://x",
    });
  }
  override async runToString(_input: RunInput): Promise<string> {
    const idx = Math.min(this.attempts, this.responses.length - 1);
    this.attempts++;
    return this.responses[idx]!;
  }
  override async *run(_input: RunInput): AsyncGenerator<InferenceEvent> {
    yield { type: "done", total_tokens: 0, duration_ms: 1 };
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "teambrain-render-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = dir;
  await initVault();
  await addProfile(makeProfile({ id: "alice", display_name: "Alice" }));
  await createProject("Acme");
  await createSubproject("acme", "Q2");
  const d = await createDump("acme", "q2", "alice", "Step 3 onboarding asks for billing too early.");
  dumpId = d.id;
  await writeIdeasBundle("acme", "q2", {
    ideas: {
      ideas: [
        {
          idea_id: "i1",
          statement: "Billing too early",
          type: "concern",
          cluster_id: "c1",
          contributing_dumps: [dumpId],
          created: new Date().toISOString(),
        },
      ],
    },
    connections: { connections: [] },
    attribution: {
      i1: [{ dump_id: dumpId, author: "alice", verbatim_quote: "Step 3 onboarding asks for billing too early." }],
    },
  });
});

afterEach(async () => {
  if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
  else process.env["TEAMBRAIN_VAULT"] = originalVault;
  await rm(dir, { recursive: true, force: true });
});

describe("renderSynthesis", () => {
  test("writes synthesis/latest.md when output passes citation validation", async () => {
    const goodOutput = `## Agreed\n- Step 3 too early in funnel [alice, ${dumpId}]\n\n## Disputed\n\n## Move forward\n`;
    const svc = new FakeService([goodOutput]);
    const result = await renderSynthesis({
      service: svc,
      project: "acme",
      sub: "q2",
      modelName: "gemma3:4b",
      inputs: [{ dump_id: dumpId, hash: "h1" }],
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
    expect(existsSync(resolveVaultPath("projects", "acme", "subprojects", "q2", "synthesis", "latest.md"))).toBe(true);
  });

  test("re-prompts on bad citation, succeeds on retry", async () => {
    const badOutput = `## Agreed\n- Step 3 too early [alice, ghost-dump]\n\n## Disputed\n\n## Move forward\n`;
    const goodOutput = `## Agreed\n- Step 3 too early [alice, ${dumpId}]\n\n## Disputed\n\n## Move forward\n`;
    const svc = new FakeService([badOutput, goodOutput]);
    const result = await renderSynthesis({
      service: svc,
      project: "acme",
      sub: "q2",
      modelName: "gemma3:4b",
      inputs: [{ dump_id: dumpId, hash: "h1" }],
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  test("returns ok=false after exhausting retries on persistently bad citations", async () => {
    const bad = `## Agreed\n- ghost [alice, ghost]\n\n## Disputed\n\n## Move forward\n`;
    const svc = new FakeService([bad, bad, bad]);
    const result = await renderSynthesis({
      service: svc,
      project: "acme",
      sub: "q2",
      modelName: "gemma3:4b",
      inputs: [{ dump_id: dumpId, hash: "h1" }],
      maxRetries: 2,
    });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.validatorComplaints.length).toBeGreaterThan(0);
  });

  test("throws when there are no ideas to render", async () => {
    await createSubproject("acme", "Empty");
    const svc = new FakeService(["whatever"]);
    await expect(
      renderSynthesis({
        service: svc,
        project: "acme",
        sub: "empty",
        modelName: "gemma3:4b",
        inputs: [],
      }),
    ).rejects.toThrow(/no ideas/);
  });
});
