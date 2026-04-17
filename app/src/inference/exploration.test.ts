import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault } from "../vault/init";
import { writeIdeasBundle } from "../vault/ideas";
import { createProject } from "../vault/projects";
import { createSubproject } from "../vault/subprojects";
import {
  appendTabMessage,
  assertValidTabId,
  buildContextBlock,
  InvalidTabId,
  loadTabHistory,
  retrieveFromGraph,
} from "./exploration";

let tmpRoot: string;
let originalVault: string | undefined;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "teambrain-expl-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = tmpRoot;
  await initVault();
  await createProject("Acme");
  await createSubproject("acme", "Q2");
});

afterEach(async () => {
  if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
  else process.env["TEAMBRAIN_VAULT"] = originalVault;
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("assertValidTabId", () => {
  test("accepts safe ids", () => {
    expect(() => assertValidTabId("abc-123_XYZ")).not.toThrow();
  });
  test("rejects ids with path separators or special chars", () => {
    expect(() => assertValidTabId("../escape")).toThrow(InvalidTabId);
    expect(() => assertValidTabId("with space")).toThrow(InvalidTabId);
  });
});

describe("tab history", () => {
  test("appendTabMessage round-trips through loadTabHistory", async () => {
    const t1 = await appendTabMessage("tab-a", null, { role: "user", content: "hello" });
    expect(t1.messages).toHaveLength(1);
    const t2 = await appendTabMessage("tab-a", null, { role: "assistant", content: "hi" });
    expect(t2.messages).toHaveLength(2);
    const back = await loadTabHistory("tab-a");
    expect(back?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  test("loadTabHistory returns null for unknown tabs", async () => {
    expect(await loadTabHistory("nope")).toBeNull();
  });

  test("rejects invalid tab id at write", async () => {
    await expect(appendTabMessage("../bad", null, { role: "user", content: "x" })).rejects.toThrow(InvalidTabId);
  });
});

describe("retrieveFromGraph", () => {
  beforeEach(async () => {
    await writeIdeasBundle("acme", "q2", {
      ideas: {
        ideas: [
          {
            idea_id: "i1",
            statement: "Step 3 onboarding asks for billing too early",
            type: "concern",
            cluster_id: null,
            contributing_dumps: ["alice-d1"],
            created: "2026-01-01T00:00:00Z",
          },
          {
            idea_id: "i2",
            statement: "Show product value before any monetization step",
            type: "proposal",
            cluster_id: null,
            contributing_dumps: ["bob-d1"],
            created: "2026-01-01T00:00:00Z",
          },
          {
            idea_id: "i3",
            statement: "Pricing page needs A/B test next quarter",
            type: "deliverable",
            cluster_id: null,
            contributing_dumps: ["carol-d1"],
            created: "2026-01-01T00:00:00Z",
          },
        ],
      },
      connections: { connections: [] },
      attribution: {
        i1: [{ dump_id: "alice-d1", author: "alice", verbatim_quote: "billing too early" }],
        i2: [{ dump_id: "bob-d1", author: "bob", verbatim_quote: "value first" }],
        i3: [{ dump_id: "carol-d1", author: "carol", verbatim_quote: "pricing test" }],
      },
    });
  });

  test("returns ideas whose statements contain query terms, ranked by hit count", async () => {
    const out = await retrieveFromGraph("acme", "q2", "billing onboarding");
    expect(out[0]?.idea_id).toBe("i1");
  });

  test("returns the first topK ideas when query has no usable terms", async () => {
    const out = await retrieveFromGraph("acme", "q2", "?? ! ??", 2);
    expect(out).toHaveLength(2);
  });

  test("returns empty when no idea matches a meaningful query", async () => {
    const out = await retrieveFromGraph("acme", "q2", "cryptocurrency tokenomics");
    expect(out).toEqual([]);
  });
});

describe("buildContextBlock", () => {
  test("formats a context tag listing retrieved ideas", () => {
    const block = buildContextBlock([
      { idea_id: "i1", statement: "x", type: "concern", contributing_dumps: ["d1"] },
    ]);
    expect(block).toContain("<context source=\"knowledge_graph\">");
    expect(block).toContain("i1");
    expect(block).toContain("\"x\"");
  });

  test("returns empty string when no ideas", () => {
    expect(buildContextBlock([])).toBe("");
  });
});
