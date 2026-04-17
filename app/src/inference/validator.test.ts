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

// Regression: pipeline-quality T013 — the per-bullet citation check used
// `markdown.indexOf(trimmedLine)` to recover each bullet's position. That
// returns the FIRST occurrence of the substring and silently assigned the
// wrong char-index window to any bullet whose trimmed text appeared as a
// substring of an earlier line. Real Fixture A rerenders on Disputed output
// (where two contradiction bullets shared long shape) tripped this: the
// second bullet's window landed on the first bullet's citations, hiding
// missing/misplaced citations in the repair prompt. The renderer then
// retried forever with the same repair instruction and never wrote
// latest.md. The fix walks lines once and pins each bullet to its real
// [start,end) char-range so "hasCitation" is a pure containment check.
describe("validateCitations (T013 — line-walk based bullet windowing)", () => {
  test("each bullet is matched to citations that physically sit on its line", async () => {
    const d1 = await createDump("acme", "q2", "alice", "first");
    const d2 = await createDump("acme", "q2", "bob", "second");
    // Mimic assembleMarkdown output exactly — this is what renderSynthesis
    // produces for Fixture A after the T002 grammar refactor.
    const md = [
      "## Agreed",
      `- Step 3 broke the funnel [Alice, ${d1.id}]`,
      "",
      "## Disputed",
      `- Alice and Bob disagree on whether to defer billing [Alice, ${d1.id}] [Bob, ${d2.id}]`,
      "",
      "## Move forward",
      `- Ship the split funnel behind a flag [Bob, ${d2.id}]`,
    ].join("\n");
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(true);
    expect(result.complaints).toEqual([]);
  });

  test("empty sections render as _(none)_ placeholder and are not flagged as bullets", async () => {
    const d1 = await createDump("acme", "q2", "alice", "x");
    const md = [
      "## Agreed",
      `- The only agreed bullet [Alice, ${d1.id}]`,
      "",
      "## Disputed",
      "_(none)_",
      "",
      "## Move forward",
      "_(none)_",
    ].join("\n");
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(true);
  });

  test("bullet whose trimmed text is a substring of another bullet's trimmed text still validates against its own line", async () => {
    // Previously this case silently passed for the wrong reason: indexOf
    // returned the EARLIER line's position and happened to find a citation
    // in the +200 slop window, so the shorter bullet "inherited" citations
    // it does not actually carry. The line-walk implementation checks the
    // shorter bullet's own char-range and still passes because it DOES
    // carry a citation on its own line.
    const d1 = await createDump("acme", "q2", "alice", "x");
    const d2 = await createDump("acme", "q2", "bob", "y");
    const md = [
      "## Agreed",
      `- Billing at step 3 broke the funnel [Alice, ${d1.id}] because the card form is heavy [Bob, ${d2.id}]`,
      `- Billing at step 3 broke the funnel [Alice, ${d1.id}]`,
      "",
      "## Disputed",
      "_(none)_",
      "",
      "## Move forward",
      "_(none)_",
    ].join("\n");
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(true);
  });

  test("flags a bullet that truly has no citation even when an earlier bullet has citations nearby", async () => {
    // The old +200 slop window could mask a missing citation on a short
    // bullet if an adjacent long bullet had citations extending into the
    // slop range. Under the line-walk rule, each bullet's window stops at
    // its own end-of-line so the missing citation is surfaced.
    const d1 = await createDump("acme", "q2", "alice", "x");
    const md = [
      "## Agreed",
      `- Properly cited bullet with a real citation right here [Alice, ${d1.id}]`,
      "- A second bullet that forgot its citation",
      "",
      "## Disputed",
      "_(none)_",
      "",
      "## Move forward",
      "_(none)_",
    ].join("\n");
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(false);
    expect(result.complaints.some((c) => /lacks a/.test(c.reason))).toBe(true);
    // The complaint must point to the actual offending line (line 3), not
    // the preceding correctly-cited line.
    expect(result.complaints.find((c) => /lacks a/.test(c.reason))?.reason).toMatch(/line 3/);
  });

  test("reports correct line numbers for missing-citation complaints in a multi-section document", async () => {
    const d1 = await createDump("acme", "q2", "alice", "x");
    const md = [
      "## Agreed", // line 1
      `- Cited [Alice, ${d1.id}]`, // line 2
      "", // line 3
      "## Disputed", // line 4
      "- Uncited disputed bullet", // line 5
      "", // line 6
      "## Move forward", // line 7
      "- Another uncited one", // line 8
    ].join("\n");
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(false);
    const reasons = result.complaints.map((c) => c.reason).filter((r) => /lacks a/.test(r));
    expect(reasons.some((r) => r.includes("line 5"))).toBe(true);
    expect(reasons.some((r) => r.includes("line 8"))).toBe(true);
  });

  test("flags an uncited bullet whose trimmed text appears verbatim inside an earlier cited bullet (old indexOf would false-pass)", async () => {
    // This is the sharp-edge case the T013 fix explicitly targets. The
    // previous `markdown.indexOf(trimmed)` call returned the EARLIER
    // substring position, anchored the +200-char window on the first
    // bullet, and picked up that bullet's citations — claiming the
    // uncited bullet was fine. Line-walk positions make this impossible.
    const d1 = await createDump("acme", "q2", "alice", "x");
    const d2 = await createDump("acme", "q2", "bob", "y");
    const bulletTwoText = "- uncited follow-up bullet";
    const md = [
      "## Agreed",
      `- Alice wrote: ${bulletTwoText} in her dump [Alice, ${d1.id}] [Bob, ${d2.id}]`,
      bulletTwoText,
      "",
      "## Disputed",
      "_(none)_",
      "",
      "## Move forward",
      "_(none)_",
    ].join("\n");
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(false);
    const missing = result.complaints.find((c) => /lacks a/.test(c.reason));
    expect(missing?.reason).toMatch(/line 3/);
  });

  test("handles CRLF line endings without drifting citation windows", async () => {
    const d1 = await createDump("acme", "q2", "alice", "x");
    const md = ["## Agreed", `- Cited [Alice, ${d1.id}]`, "", "## Disputed", "_(none)_", "", "## Move forward", "_(none)_"].join("\r\n");
    const result = await validateCitations({ markdown: md, project: "acme", sub: "q2" });
    expect(result.ok).toBe(true);
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
