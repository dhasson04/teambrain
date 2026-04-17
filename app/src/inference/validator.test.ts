import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDump } from "../vault/dumps";
import { initVault } from "../vault/init";
import { addProfile, makeProfile } from "../vault/profiles";
import { createProject } from "../vault/projects";
import { createSubproject } from "../vault/subprojects";
import { parseCitations, validateCitations } from "./validator";

let tmpRoot: string;
let originalVault: string | undefined;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "teambrain-val-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = tmpRoot;
  await initVault();
  await addProfile(makeProfile({ id: "alice", display_name: "Alice" }));
  await addProfile(makeProfile({ id: "bob", display_name: "Bob" }));
  await createProject("Acme");
  await createSubproject("acme", "Q2");
});

afterEach(async () => {
  if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
  else process.env["TEAMBRAIN_VAULT"] = originalVault;
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("parseCitations", () => {
  test("captures inline [Author, dump-id] markers", () => {
    const md = "Step 3 issue [alice, alice-2026-01-01-1430] and follow-up [bob, bob-2026-01-02-0930].";
    const cites = parseCitations(md);
    expect(cites).toHaveLength(2);
    expect(cites[0]?.author).toBe("alice");
    expect(cites[0]?.dump_id).toBe("alice-2026-01-01-1430");
    expect(cites[1]?.author).toBe("bob");
  });

  test("returns empty list when no citations present", () => {
    expect(parseCitations("just prose, no citations")).toEqual([]);
  });
});

describe("validateCitations", () => {
  test("ok when every citation references a real dump with matching author", async () => {
    const d1 = await createDump("acme", "q2", "alice", "Step 3 onboarding asks for billing too early.");
    const md = `## Agreed\n- Step 3 too early [alice, ${d1.id}]\n`;
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(true);
    expect(result.complaints).toEqual([]);
  });

  test("complains when dump-id does not exist", async () => {
    const md = `## Agreed\n- Something [alice, alice-bogus]\n`;
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(false);
    expect(result.complaints[0]?.reason).toContain("does not exist");
    expect(result.repairInstruction).toContain("alice-bogus");
  });

  test("complains when citation author does not match dump author", async () => {
    const d1 = await createDump("acme", "q2", "alice", "x");
    const md = `## Agreed\n- Bad [bob, ${d1.id}]\n`;
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(false);
    expect(result.complaints[0]?.reason).toContain("author mismatch");
  });

  test("complains about bullets without any citation when requirePerBullet is on", async () => {
    const md = `## Agreed\n- Naked bullet with no citation\n`;
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(false);
    expect(result.complaints[0]?.reason).toContain("lacks a");
  });

  test("requirePerBullet=false skips the bullet check", async () => {
    const md = `## Agreed\n- Naked bullet with no citation\n`;
    const result = await validateCitations({
      markdown: md,
      project: "acme",
      sub: "q2",
      requirePerBullet: false,
    });
    expect(result.ok).toBe(true);
  });

  test("repair instruction enumerates every problem", async () => {
    const md = `## Agreed\n- A [alice, ghost-1]\n- B [carol, ghost-2]\n`;
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(false);
    expect(result.repairInstruction).toMatch(/1\..*\n2\..*/);
  });
});

// Regression: backprop-2, BUG-3 — renderer emits profile-UUID as dump-id when
// the timestamp suffix is stripped. Currently validator returns identical
// "does not exist" complaint on every retry, so repair prompts cannot succeed.
// Enable when implementing the prefix-normalization fix. See spec-synthesis.md R008.
describe("validateCitations (backprop-2, BUG-3 — dump-id prefix tolerance)", () => {
  test("normalizes and accepts citation that uses a unique profile-uuid prefix", async () => {
    const d1 = await createDump("acme", "q2", "alice", "Step 3 onboarding asks for billing too early.");
    // d1.id is like "alice-<timestamp>". Model emits just "alice" (the profile uuid prefix).
    const profilePrefix = d1.id.split("-")[0]!;
    const md = `## Agreed\n- Billing too early [Alice, ${profilePrefix}]\n`;
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(true);
  });

  test("emits ambiguous prefix complaint when profile has multiple dumps", async () => {
    const d1 = await createDump("acme", "q2", "alice", "First dump.");
    const d2 = await createDump("acme", "q2", "alice", "Second dump.");
    const profilePrefix = d1.id.split("-")[0]!;
    const md = `## Agreed\n- Something [Alice, ${profilePrefix}]\n`;
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(false);
    expect(result.complaints[0]?.reason).toMatch(/ambiguous prefix/i);
    expect(result.complaints[0]?.reason).toContain(d1.id);
    expect(result.complaints[0]?.reason).toContain(d2.id);
  });

  test("accepts citation when author is the display_name 'Alice' and dump author is profile uuid", async () => {
    // Post-fix the renderer emits [Alice, <dump-id>] (display_name) rather than
    // [<uuid>, <dump-id>]. Validator must accept display_name → author resolution.
    const d1 = await createDump("acme", "q2", "alice", "x");
    const md = `## Agreed\n- Claim [Alice, ${d1.id}]\n`;
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(true);
  });
});
