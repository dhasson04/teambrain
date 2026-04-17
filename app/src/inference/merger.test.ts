import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AttributedIdea } from "./extractor";
import { InferenceService, type InferenceEvent, type RunInput } from "./inference-service";
import { assignIdeaIds, mergeIdeas } from "./merger";
import { PromptRegistry } from "./prompt-registry";
import { initVault } from "../vault/init";
import { createProject } from "../vault/projects";
import { createSubproject } from "../vault/subprojects";
import { readIdeasBundle } from "../vault/ideas";

let dir: string;
let originalVault: string | undefined;

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
  dir = await mkdtemp(join(tmpdir(), "teambrain-merge-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = dir;
  await initVault();
  await createProject("Acme");
  await createSubproject("acme", "Q2");
});

afterEach(async () => {
  if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
  else process.env["TEAMBRAIN_VAULT"] = originalVault;
  await rm(dir, { recursive: true, force: true });
});

const fixture = (): AttributedIdea[] => [
  {
    statement: "Step 3 onboarding asks for billing too early",
    type: "concern",
    evidence_quote: "Step 3 asks for billing too early",
    confidence: 0.9,
    dump_id: "alice-d1",
    author: "alice",
  },
  {
    statement: "Step 3 onboarding asks for billing too early",
    type: "concern",
    evidence_quote: "billing field is too early",
    confidence: 0.85,
    dump_id: "bob-d1",
    author: "bob",
  },
  {
    statement: "We should keep billing optional to preserve revenue path",
    type: "claim",
    evidence_quote: "keep billing optional",
    confidence: 0.7,
    dump_id: "carol-d1",
    author: "carol",
  },
];

describe("assignIdeaIds", () => {
  test("emits stable ids based on dump_id + index", () => {
    const out = assignIdeaIds(fixture());
    expect(out[0]?.idea_id).toBe("alice-d1-i0");
    expect(out[1]?.idea_id).toBe("bob-d1-i0");
    expect(out[2]?.idea_id).toBe("carol-d1-i0");
  });

  test("multiple ideas from same dump get incrementing index", () => {
    const ideas: AttributedIdea[] = [
      ...fixture(),
      {
        statement: "Funnel rework needed",
        type: "deliverable",
        evidence_quote: "rework",
        confidence: 0.5,
        dump_id: "alice-d1",
        author: "alice",
      },
    ];
    const out = assignIdeaIds(ideas);
    const aliceIds = out.filter((i) => i.dump_id === "alice-d1").map((i) => i.idea_id);
    expect(aliceIds).toEqual(["alice-d1-i0", "alice-d1-i1"]);
  });
});

describe("mergeIdeas", () => {
  test("writes a valid IdeasBundle with cluster assignment, edges, and attribution", async () => {
    const cannedResponse = JSON.stringify({
      clusters: [
        { cluster_id: "c-billing", member_idea_ids: ["alice-d1-i0", "bob-d1-i0"] },
        { cluster_id: "c-revenue", member_idea_ids: ["carol-d1-i0"] },
      ],
      contradictions: [
        { left_idea_id: "alice-d1-i0", right_idea_id: "carol-d1-i0", reason: "remove vs keep billing" },
      ],
      edges: [
        { from: "alice-d1-i0", to: "bob-d1-i0", kind: "agree", weight: 0.95 },
      ],
    });
    const svc = new FakeService([cannedResponse]);
    const out = await mergeIdeas({ service: svc, project: "acme", sub: "q2", attributed: fixture() });

    expect(out.ideas.ideas).toHaveLength(3);
    const alice = out.ideas.ideas.find((i) => i.idea_id === "alice-d1-i0");
    expect(alice?.cluster_id).toBe("c-billing");
    expect(out.connections.connections.some((e) => e.kind === "contradict")).toBe(true);
    expect(out.connections.connections.some((e) => e.kind === "agree")).toBe(true);
    expect(out.attribution["carol-d1-i0"]?.[0]?.author).toBe("carol");

    // Round-trip from disk to confirm invariants pass
    const onDisk = await readIdeasBundle("acme", "q2");
    expect(onDisk.ideas.ideas).toHaveLength(3);
  });

  test("drops edges that reference unknown idea ids without crashing", async () => {
    const cannedResponse = JSON.stringify({
      clusters: [],
      contradictions: [],
      edges: [
        { from: "alice-d1-i0", to: "bob-d1-i0", kind: "related", weight: 0.5 },
        { from: "ghost", to: "alice-d1-i0", kind: "agree", weight: 0.5 },
      ],
    });
    const svc = new FakeService([cannedResponse]);
    const out = await mergeIdeas({ service: svc, project: "acme", sub: "q2", attributed: fixture() });
    expect(out.connections.connections).toHaveLength(1);
    expect(out.connections.connections[0]?.from_idea).toBe("alice-d1-i0");
  });

  test("schema rejects malformed merge response", async () => {
    const svc = new FakeService([JSON.stringify({ clusters: "not an array" })]);
    await expect(
      mergeIdeas({ service: svc, project: "acme", sub: "q2", attributed: fixture() }),
    ).rejects.toThrow();
  });
});
