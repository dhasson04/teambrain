import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  classifyPair,
  findContradictionCandidates,
  isDegradedModeForTest,
  resetNliForTest,
} from "./nli";

let nliAvailable = false;
let nliFunctional = false;

// First-time model download can take > 60s. Subsequent runs are fast.
beforeAll(async () => {
  try {
    await classifyPair("The sky is blue.", "The sky is not blue.");
    nliAvailable = true;
    // nli.ts auto-probes and sets degradedMode when transformers.js
    // misbehaves. If it's in degraded mode, tests can only verify the
    // "returns no false positives" contract, not the "finds real
    // contradictions" contract.
    nliFunctional = !isDegradedModeForTest();
  } catch (e) {
    console.warn(`[nli.test] NLI pipeline unavailable: ${(e as Error).message}`);
    nliAvailable = false;
  }
}, 600000);

afterAll(() => {
  resetNliForTest();
});

describe("classifyPair (NLI, R003)", () => {
  test("degraded mode detection — returns zeros when pipeline misbehaves", async () => {
    if (!nliAvailable) return;
    if (nliFunctional) return; // this test only asserts the degraded-mode contract
    const s = await classifyPair("anything", "anything else");
    expect(s.contradiction).toBe(0);
    expect(s.entailment).toBe(0);
    expect(s.neutral).toBe(0);
  });

  test("identifies obvious contradictions (skipped in degraded mode)", async () => {
    if (!nliAvailable || !nliFunctional) return;
    const s = await classifyPair(
      "We will ship the product on May 1.",
      "We will not ship the product on May 1; we are pushing to June.",
    );
    expect(s.contradiction).toBeGreaterThan(s.entailment);
    expect(s.contradiction).toBeGreaterThan(0.5);
  });

  test("identifies obvious entailments (skipped in degraded mode)", async () => {
    if (!nliAvailable || !nliFunctional) return;
    const s = await classifyPair("All the tests are passing.", "The test suite is green.");
    expect(s.entailment).toBeGreaterThan(s.contradiction);
  });

  test("identifies neutral pairs (skipped in degraded mode)", async () => {
    if (!nliAvailable || !nliFunctional) return;
    const s = await classifyPair(
      "The billing form is too long.",
      "We should add dark mode to the marketing site.",
    );
    expect(s.contradiction).toBeLessThan(0.6);
  });
});

describe("findContradictionCandidates (R003 bi-directional + margin guards)", () => {
  test("returns [] when NLI is in degraded mode — zero false positives by construction", async () => {
    if (!nliAvailable) return;
    if (nliFunctional) return; // functional-mode assertions below
    const results = await findContradictionCandidates([
      {
        idea_a_id: "i1",
        idea_a_text: "We ship by May 1. Full stop.",
        idea_b_id: "i2",
        idea_b_text: "We should push the launch past May.",
      },
    ]);
    expect(results).toEqual([]);
  });

  test("confirms a pair that contradicts in both directions (skipped in degraded mode)", async () => {
    if (!nliAvailable || !nliFunctional) return;
    const results = await findContradictionCandidates([
      {
        idea_a_id: "i1",
        idea_a_text: "We ship by May 1. Full stop.",
        idea_b_id: "i2",
        idea_b_text: "We should push the launch past May.",
      },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]?.idea_a_id).toBe("i1");
    expect(results[0]?.idea_b_id).toBe("i2");
  });

  test("rejects a non-contradiction pair (skipped in degraded mode)", async () => {
    if (!nliAvailable || !nliFunctional) return;
    const results = await findContradictionCandidates([
      {
        idea_a_id: "i1",
        idea_a_text: "Rollback plan: feature flag toggle.",
        idea_b_id: "i2",
        idea_b_text: "The live test starts today and reports April 24.",
      },
    ]);
    expect(results).toHaveLength(0);
  });
});
