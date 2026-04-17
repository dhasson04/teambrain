import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault } from "./init";
import { createProject } from "./projects";
import { createSubproject } from "./subprojects";
import {
  type AttributionFile,
  type ConnectionsFile,
  type IdeasFile,
  InvariantViolation,
  readIdeasBundle,
  writeIdeasBundle,
} from "./ideas";
import { resolveVaultPath } from "./fs-utils";

let tmpRoot: string;
let originalVault: string | undefined;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "teambrain-ideas-"));
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

const goodBundle = (): { ideas: IdeasFile; connections: ConnectionsFile; attribution: AttributionFile } => ({
  ideas: {
    ideas: [
      {
        idea_id: "i1",
        statement: "Step 3 onboarding overload",
        type: "concern",
        cluster_id: "c1",
        contributing_dumps: ["alice-2026-01-01"],
        created: "2026-01-01T00:00:00Z",
      },
      {
        idea_id: "i2",
        statement: "Show value first",
        type: "proposal",
        contributing_dumps: ["alice-2026-01-01"],
        created: "2026-01-01T00:00:00Z",
      },
    ],
  },
  connections: {
    connections: [
      { edge_id: "e1", from_idea: "i2", to_idea: "i1", kind: "agree", weight: 0.8 },
    ],
  },
  attribution: {
    i1: [{ dump_id: "alice-2026-01-01", author: "alice", verbatim_quote: "step 3 is too much" }],
    i2: [{ dump_id: "alice-2026-01-01", author: "alice", verbatim_quote: "value first" }],
  },
});

describe("ideas bundle", () => {
  test("round-trips through write + read", async () => {
    await writeIdeasBundle("acme", "q2", goodBundle());
    const out = await readIdeasBundle("acme", "q2");
    expect(out.ideas.ideas).toHaveLength(2);
    expect(out.connections.connections[0]?.kind).toBe("agree");
    expect(out.attribution["i1"]?.[0]?.author).toBe("alice");
  });

  test("writes all three files atomically (no .tmp left behind)", async () => {
    await writeIdeasBundle("acme", "q2", goodBundle());
    for (const f of ["ideas.json", "connections.json", "attribution.json"]) {
      const path = resolveVaultPath("projects", "acme", "subprojects", "q2", "ideas", f);
      const content = await readFile(path, "utf8");
      expect(content.length).toBeGreaterThan(0);
    }
  });

  test("rejects an idea without attribution", async () => {
    const bundle = goodBundle();
    delete bundle.attribution["i1"];
    await expect(writeIdeasBundle("acme", "q2", bundle)).rejects.toThrow(InvariantViolation);
  });

  test("rejects a connection that references a missing idea", async () => {
    const bundle = goodBundle();
    bundle.connections.connections.push({
      edge_id: "ghost",
      from_idea: "i999",
      to_idea: "i1",
      kind: "related",
      weight: 0.3,
    });
    await expect(writeIdeasBundle("acme", "q2", bundle)).rejects.toThrow(InvariantViolation);
  });

  test("rejects a self-referencing contradict edge", async () => {
    const bundle = goodBundle();
    bundle.connections.connections = [
      { edge_id: "self", from_idea: "i1", to_idea: "i1", kind: "contradict", weight: 0.9 },
    ];
    await expect(writeIdeasBundle("acme", "q2", bundle)).rejects.toThrow(InvariantViolation);
  });

  test("rejects a contributing_dumps-empty idea (zod-level)", async () => {
    const bundle = goodBundle();
    bundle.ideas.ideas[0]!.contributing_dumps = [];
    await expect(writeIdeasBundle("acme", "q2", bundle)).rejects.toThrow();
  });

  test("readIdeasBundle returns empty defaults before any write", async () => {
    await createSubproject("acme", "Pristine");
    const out = await readIdeasBundle("acme", "pristine");
    expect(out.ideas.ideas).toEqual([]);
    expect(out.connections.connections).toEqual([]);
    expect(out.attribution).toEqual({});
  });
});
