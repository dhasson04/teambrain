import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault } from "../vault/init";
import { addProfile, makeProfile } from "../vault/profiles";
import { extractHints, extractHintsSync, formatHintsBlock } from "./hints";

const BOB_DUMP = `From an engineering standpoint, the split funnel is straightforward.
We already have feature flags. I can have the soft path branch
behind a flag in two days, behind one prod gate.

But I want to push on Carol's visual-weight hypothesis before we
just defer billing. If the credit-card form is what's scaring
people, splitting funnels won't fix it - the hard path will still
underperform. We should also test a "billing minimized" variant
where the form collapses to a single line until the user opts in.

I disagree with Alice that we don't need an A/B test for the
basic finding. Cohort comparisons are biased - the people who
bypassed step 3 are existing customers with cards on file, they
are not the same population as new signups. We need a proper test.

Also: the activity feed says Dan hasn't dumped yet. We should not
make a decision before he weighs in on the small-business cohort
slice.`;

describe("extractHintsSync", () => {
  test("extracts noun phrases from Bob's fixture dump", () => {
    const h = extractHintsSync(BOB_DUMP);
    const nounsLower = h.nouns.map((n) => n.toLowerCase());
    // A few phrases we'd definitely expect compromise to catch:
    expect(nounsLower.some((n) => n.includes("feature flag"))).toBe(true);
    expect(nounsLower.some((n) => n.includes("credit-card") || n.includes("credit card"))).toBe(true);
    expect(nounsLower.some((n) => n.includes("a/b test") || n.includes("test"))).toBe(true);
  });

  test("extracts step numbers and duration expressions", () => {
    const h = extractHintsSync(BOB_DUMP);
    const nums = h.numbers.map((n) => n.toLowerCase());
    expect(nums.some((n) => n.includes("step 3"))).toBe(true);
    expect(nums.some((n) => n.includes("two days"))).toBe(true);
  });

  test("filters stopword noun phrases", () => {
    const h = extractHintsSync("I have ideas about things and stuff. People are important.");
    const nounsLower = h.nouns.map((n) => n.toLowerCase());
    expect(nounsLower).not.toContain("ideas");
    expect(nounsLower).not.toContain("things");
    expect(nounsLower).not.toContain("stuff");
    expect(nounsLower).not.toContain("people");
  });

  test("deduplicates repeated noun phrases", () => {
    const h = extractHintsSync("The billing form. The billing form. The billing form.");
    const billingMatches = h.nouns.filter((n) => n.toLowerCase().includes("billing form"));
    expect(billingMatches.length).toBe(1);
  });

  test("runs in under 50ms for a 2 KB dump", () => {
    const t0 = performance.now();
    extractHintsSync(BOB_DUMP);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(50);
  });
});

describe("extractHints (async, with profile resolution)", () => {
  let dir: string;
  let originalVault: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "teambrain-hints-"));
    originalVault = process.env["TEAMBRAIN_VAULT"];
    process.env["TEAMBRAIN_VAULT"] = dir;
    await initVault();
    await addProfile(makeProfile({ id: "dan-uuid-123", display_name: "Dan" }));
    await addProfile(makeProfile({ id: "alice-uuid-456", display_name: "Alice" }));
  });

  afterEach(async () => {
    if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
    else process.env["TEAMBRAIN_VAULT"] = originalVault;
    await rm(dir, { recursive: true, force: true });
  });

  test("resolves first-name mentions against profiles.json display_names", async () => {
    const h = await extractHints(BOB_DUMP);
    // Dan is in profiles (exact display_name) — should be annotated.
    const danEntry = h.people.find((p) => p.toLowerCase().startsWith("dan"));
    expect(danEntry).toBeDefined();
    expect(danEntry).toContain("profile:dan-uuid-123");
    // Alice is in profiles too.
    const aliceEntry = h.people.find((p) => p.toLowerCase().startsWith("alice"));
    expect(aliceEntry).toBeDefined();
    expect(aliceEntry).toContain("profile:alice-uuid-456");
    // Carol is mentioned but NOT in profiles — should stay unresolved.
    const carolEntry = h.people.find((p) => p.toLowerCase().startsWith("carol"));
    if (carolEntry) expect(carolEntry).not.toContain("profile:");
  });

  test("returns unresolved names when no profiles are loadable", async () => {
    process.env["TEAMBRAIN_VAULT"] = "/nonexistent/path";
    const h = await extractHints("Alice said something. Bob agreed.");
    // Should not crash; should return raw names.
    expect(Array.isArray(h.people)).toBe(true);
  });
});

describe("formatHintsBlock", () => {
  test("emits nothing when hints are empty", () => {
    expect(formatHintsBlock({ nouns: [], people: [], numbers: [] })).toBe("");
  });

  test("emits an <entities> block with JSON-encoded arrays", () => {
    const out = formatHintsBlock({
      nouns: ["billing form", "feature flag"],
      people: ["Alice"],
      numbers: ["step 3"],
    });
    expect(out).toContain("<entities>");
    expect(out).toContain("</entities>");
    expect(out).toContain("noun phrases");
    expect(out).toContain("billing form");
    expect(out).toContain("Alice");
    expect(out).toContain("step 3");
  });
});
