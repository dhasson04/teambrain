// T003 — Fixture B for spec-pipeline-quality.md R001-R009 acceptance.
//
// A four-dump subproject designed so downstream tests have unambiguous
// pass/fail signals:
//
//   - 3-author agreement cluster: lcuasduys + bob + dan all support shipping
//     by May 1 (with conditions). Carol is the dissenter.
//   - Explicit contradiction pair for NLI (R003):
//       lcuasduys: "We ship by May 1. Full stop."
//       carol:     "I think we should push the launch past May."
//   - Non-contradict cross-author pair (R003 false-positive test):
//       bob:       "Rollback plan: feature flag toggle"
//       dan:       "The live test starts today, reporting April 24"
//   - Material-only fact (R005):
//       The legal-memo-kyc.md names May 15 as the KYC regulatory deadline.
//       That date appears in no dump. If the render cites May 15, retrieval
//       worked; if not, it didn't.
//
// Lives here as TypeScript (tracked) because app/vault/ is gitignored.
// A local copy of the same content sits in app/vault/ for manual E2E but
// must be re-seeded from this module for deterministic unit tests.

export const LAUNCH_SEQUENCE_SLUG = "launch-sequence";
export const LAUNCH_SEQUENCE_DISPLAY = "Launch sequence";

export const PROFILES = [
  { id: "1cea426c-4f80-4da5-b17d-38caa04313fe", display_name: "lcuasduys" },
  { id: "6827d9fc-79c9-45ea-888d-632318ee63fc", display_name: "bob" },
  { id: "e1adf205-a9d1-43fd-b510-bd7a8d748b61", display_name: "carol" },
  { id: "7aa3a68f-b8dc-4e21-a9bd-d10b9c6a8e14", display_name: "dan" },
] as const;

export const PROBLEM = `We committed to shipping onboarding v2 by May 1. Legal wants KYC at step 3
before the redesign ships. Engineering thinks the soft-path feature flag
is ready. Design has a new demo-video variant they want to test. Data is
worried about a regression in the small-business cohort. We need to
decide by end of week whether May 1 is still the right target or if we
should push to June 1.

Budget constraint: we cannot add headcount before the ship date.
Contractual constraint: one enterprise customer has a May 3 dependency.
`;

export const MATERIALS = {
  "launch-planning-2026-04-15.md": `# Launch planning meeting — 2026-04-15

Attendees: Alice (PM), Bob (Eng), Carol (Design), Dan (Data)

## Timeline review
- Original target: May 1
- Eng status: soft-path feature flag shipped to staging Apr 10, one week
  of telemetry so far, no regressions
- Design status: demo-video variant mocked, 3 days from implementation-ready
- Legal status: KYC-at-step-3 requirement confirmed
- Contract status: Rafal Industries has a May 3 integration dependency

## Data concerns
- Small-business cohort shows a 2.3x higher dropout rate in A/B simulation
- This is a SIMULATION, not real users — Dan recommends a 2-week live test

## Budget constraint
- No additional engineering headcount until Q3
- Marketing launch budget locked as-of May 1 with partner agencies

## Action items
- Alice to confirm with Rafal Industries whether a slip to June 1 breaks
  their integration
- Dan to run live-user test starting Apr 17, report Apr 24
- Bob to confirm rollback plan
`,
  "legal-memo-kyc.md": `# Legal memo — KYC requirement

The new KYC regulation takes effect May 15. Any user who signs up on or
after May 15 without completing KYC at-or-before step 3 of the onboarding
funnel exposes the company to a 4% revenue penalty per regulator audit.

This is non-negotiable. KYC MUST be at step 3, not later. Shipping v2
without KYC-at-step-3 before May 15 is not an option.

Shipping v2 WITH KYC-at-step-3 before May 15 is preferred but not
required; we can defer the v2 ship, just not the KYC placement.
`,
};

export const DUMPS: Array<{ authorId: string; createdAt: string; body: string }> = [
  {
    authorId: "1cea426c-4f80-4da5-b17d-38caa04313fe", // lcuasduys
    createdAt: "2026-04-17T16:00:00.000Z",
    body: `We ship by May 1. Full stop. Rafal Industries has a May 3 integration
dependency and if we slip we lose that contract revenue for Q3. That's
the north star and everything else is negotiable around it.

The soft-path feature flag is ready. Bob has a week of staging telemetry
with no regressions. We don't need more data to ship — we need to stop
adding uncertainty.

Dan's small-business cohort worry is fair but we can monitor it in
production and pull the flag if the live dropout rate exceeds 1.5x
baseline. Post-launch monitoring is a known lever, not a new risk.

Legal's KYC-at-step-3 requirement is not in conflict with a May 1 ship.
We're already putting KYC at step 3 in the new flow. Done.

Decision this week, no slippage.
`,
  },
  {
    authorId: "6827d9fc-79c9-45ea-888d-632318ee63fc", // bob
    createdAt: "2026-04-17T16:05:00.000Z",
    body: `Engineering can hit May 1. The soft-path flag is green on staging and the
rollback plan for post-launch regressions is one-command. I can have the
demo-video variant wired up in three days if Carol ships the assets.

I support shipping by May 1. I am aligned with the PM on that.

BUT: Dan's live-user test starts today and reports April 24. We should
at least wait for that data point. Shipping May 1 without Dan's
confirmation is fine only if the small-business cohort drop stays under
1.5x in the first week of live data.

Rollback plan: feature flag toggle, 30-second cutover, no database
migration to undo. We are safe to ship if the telemetry holds.
`,
  },
  {
    authorId: "e1adf205-a9d1-43fd-b510-bd7a8d748b61", // carol
    createdAt: "2026-04-17T16:10:00.000Z",
    body: `I think we should push the launch past May. The demo-video variant I'm
building is the thing that actually makes v2 feel different from v1, and
I need two more weeks of iteration on it before it's shippable. Shipping
without it is shipping a minor redesign, not v2.

Alice is wrong that shipping by May 1 is non-negotiable. The Rafal
contract dependency is on the v2 APIs, not on the onboarding flow. I
talked to their integration lead last week — they can ship on May 3
against the staging build and be fine.

The small-business cohort concern Dan raised is a real risk. A 2.3x
dropout in the simulation is not something we should dismiss by saying
"we'll monitor in production."

Launch when the experience is right, not when the calendar is right.
June 1 gets us the demo-video plus two more weeks of live test data.
`,
  },
  {
    authorId: "7aa3a68f-b8dc-4e21-a9bd-d10b9c6a8e14", // dan
    createdAt: "2026-04-17T16:15:00.000Z",
    body: `The small-business cohort shows a 2.3x dropout in the A/B simulation.
That's the number I keep coming back to. The simulation is not real users
so I'm running the live test starting today, reporting April 24.

If the live test confirms the 2.3x dropout, shipping on May 1 exposes
us to a meaningful revenue hit from the small-business segment during
the first month post-launch. We should NOT ship May 1 if that confirms.

If the live test comes back under 1.5x dropout, I'm fine with May 1.

Separate point: May 15 is the legal KYC deadline. We cannot ship v2 with
KYC-after-step-3 at any date on or after May 15. If we slip past May 15
without the new flow, we expose to a 4% revenue penalty.

I agree with engineering that rollback is cheap. I support shipping by
May 1 conditional on the April 24 data.
`,
  },
];

export interface FixtureBExpectations {
  /** Ideas that MUST appear in one agreement cluster (same cluster_id). */
  agreement_cluster_statements: string[];
  /** Pair of ideas that MUST be flagged as a contradiction. */
  contradict_pair: [string, string];
  /**
   * Fact that exists ONLY in materials, not in any dump. Must appear in
   * render output if retrieval actually fed the renderer.
   * "partner agencies" is in materials/launch-planning-2026-04-15.md and
   * nowhere else.
   */
  material_only_fact_substring: string;
  /** Cross-author pair that must NOT be flagged as a contradiction. */
  non_contradict_pair: [string, string];
}

/**
 * Authoritative expectations the T006, T008, and T009 regression tests
 * assert against. Keep this in sync with the dump content above.
 */
export const EXPECTATIONS: FixtureBExpectations = {
  agreement_cluster_statements: [
    "We ship by May 1", // lcuasduys
    "I support shipping by May 1", // bob
    "I support shipping by May 1 conditional on the April 24 data", // dan
  ],
  contradict_pair: [
    "We ship by May 1", // lcuasduys
    "we should push the launch past May", // carol
  ],
  material_only_fact_substring: "partner agencies",
  non_contradict_pair: [
    "Rollback plan: feature flag toggle", // bob
    "I'm running the live test starting today", // dan
  ],
};
