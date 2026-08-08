import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveContextStatus,
  hasStrongMatch,
  normalizeMatchContext,
  parseConnectStatus,
  parseReturnState,
  resolveExperienceState,
} from "../lib/crownprint-state.mjs";

// ---------------------------------------------------------------------------
// Behavioral tests for the Shop by CrownPrint™ state resolution.
//
// These run against the real state machine — the same module the connect
// callback and the page render both import — so each test exercises the actual
// decision, not a description of it. Numbering follows the required scenarios.
//
// Fixtures below are shaped like Hair Wellness Lab responses. They deliberately
// include prohibited fields so the boundary whitelist is exercised at the same
// time as the state logic.
// ---------------------------------------------------------------------------

/** A match-ready HWL payload: paid entitlement, completed assessment, fresh CrownState. */
const matchReadyPayload = (overrides = {}) => ({
  crownPrintPresent: true,
  entitlementActive: true,
  entitlementStatus: "active",
  assessmentComplete: true,
  resultsReady: true,
  crownState: { present: true, fresh: true },
  currentPriorityLabel: "Moisture retention after takedown",
  matches: [
    { productKey: "hydrating-leave-in", productName: "Hydrating Leave-In", matchClass: "strong", why: "Layers moisture without heaviness." },
    { productKey: "scalp-oil", productName: "Scalp Oil", matchClass: "good", why: "Supports a comfortable scalp between washes." },
  ],
  ...overrides,
});

const resolve = (input) => resolveExperienceState(input);

// ---------------------------------------------------------------------------
// 1. Authenticated + completed PAID CrownPrint → actual match results.
// ---------------------------------------------------------------------------
test("1. authenticated with a completed paid CrownPrint resolves to match results", () => {
  const context = normalizeMatchContext(matchReadyPayload());

  assert.equal(context.crownPrintPresent, true);
  assert.equal(deriveContextStatus(context), "MATCH_READY");
  assert.equal(context.matches.length, 2);
  assert.equal(hasStrongMatch(context), true);

  const resolved = resolve({ integrationReady: true, context, requested: "MATCH_READY" });
  assert.equal(resolved.state, "MATCH_READY");
  assert.equal(resolved.showResults, true, "a match-ready shopper must see their matches");
});

// ---------------------------------------------------------------------------
// 2. Authenticated HWL account, no CrownPrint → NO_CROWNPRINT (not the generic
//    intro, and never a match).
// ---------------------------------------------------------------------------
test("2. authenticated with no CrownPrint resolves to NO_CROWNPRINT", () => {
  // HWL says so on the return hop, with no code minted.
  const fromStatus = resolve({ integrationReady: true, context: null, requested: parseConnectStatus("NO_CROWNPRINT") });
  assert.equal(fromStatus.state, "NO_CROWNPRINT");
  assert.equal(fromStatus.showResults, false);

  // And if HWL instead answers the exchange with a CrownPrint-less context.
  const context = normalizeMatchContext({ crownPrintPresent: false, matches: [] });
  assert.equal(deriveContextStatus(context), "NO_CROWNPRINT");
  const fromContext = resolve({ integrationReady: true, context, requested: null });
  assert.equal(fromContext.state, "NO_CROWNPRINT");
  assert.equal(fromContext.showResults, false);
});

// ---------------------------------------------------------------------------
// 3. Not signed in to Hair Wellness Lab → AUTH_REQUIRED, never NO_CROWNPRINT.
// ---------------------------------------------------------------------------
test("3. a signed-out shopper resolves to AUTH_REQUIRED, not NO_CROWNPRINT", () => {
  const resolved = resolve({ integrationReady: true, context: null, requested: parseConnectStatus("AUTH_REQUIRED") });
  assert.equal(resolved.state, "AUTH_REQUIRED");
  assert.equal(resolved.showResults, false);
  assert.notEqual(resolved.state, "NO_CROWNPRINT", "not being signed in is not a verdict about CrownPrint");

  // HWL may spell it several ways; all of them mean "send them to sign in".
  for (const spelling of ["auth_required", "AUTHENTICATION_REQUIRED", "sign-in-required", "unauthenticated"]) {
    assert.equal(parseConnectStatus(spelling), "AUTH_REQUIRED", spelling);
  }

  // An AUTH_REQUIRED verdict must also drop any results left from an earlier
  // visit on this device, rather than keep showing them to an unknown user.
  const stale = resolve({ integrationReady: true, context: normalizeMatchContext(matchReadyPayload()), requested: "AUTH_REQUIRED" });
  assert.equal(stale.state, "AUTH_REQUIRED");
  assert.equal(stale.showResults, false);
});

// ---------------------------------------------------------------------------
// 4. Signing in does NOT imply having a CrownPrint. After auth, HWL re-checks
//    and a CrownPrint-less account still resolves to NO_CROWNPRINT.
// ---------------------------------------------------------------------------
test("4. signing in with no CrownPrint still resolves to NO_CROWNPRINT", () => {
  // The post-sign-in re-check answers NO_CROWNPRINT...
  const afterSignIn = resolve({ integrationReady: true, context: null, requested: parseConnectStatus("NO_CROWNPRINT") });
  assert.equal(afterSignIn.state, "NO_CROWNPRINT");
  assert.equal(afterSignIn.showResults, false);

  // ...and it outranks any leftover session, so a newly signed-in account never
  // inherits the previous account's matches.
  const withOldSession = resolve({
    integrationReady: true,
    context: normalizeMatchContext(matchReadyPayload()),
    requested: "NO_CROWNPRINT",
  });
  assert.equal(withOldSession.state, "NO_CROWNPRINT");
  assert.equal(withOldSession.showResults, false, "an explicit NO_CROWNPRINT must never render matches");
});

// ---------------------------------------------------------------------------
// 5. Completed CrownPrint + stale CrownState → CROWNSTATE_STALE.
// ---------------------------------------------------------------------------
test("5. a stale CrownState resolves to CROWNSTATE_STALE, not NO_CROWNPRINT", () => {
  const context = normalizeMatchContext(
    matchReadyPayload({ crownState: { present: true, fresh: false, message: "It's been a while since your last check-in." } }),
  );
  assert.equal(context.crownPrintPresent, true, "the CrownPrint itself is still valid");
  assert.equal(deriveContextStatus(context), "CROWNSTATE_STALE");

  // With a session we still show the existing matches alongside the update prompt.
  const withSession = resolve({ integrationReady: true, context, requested: "CROWNSTATE_STALE" });
  assert.equal(withSession.state, "CROWNSTATE_STALE");
  assert.equal(withSession.showResults, true);

  // Without one, it is still an explicit state with its own message and CTA.
  const withoutSession = resolve({ integrationReady: true, context: null, requested: parseConnectStatus("CROWNSTATE_STALE") });
  assert.equal(withoutSession.state, "CROWNSTATE_STALE");
  assert.equal(withoutSession.showResults, false);

  // A payload that simply omits crownState must NOT be treated as stale.
  const noCrownState = normalizeMatchContext(matchReadyPayload({ crownState: undefined }));
  assert.equal(deriveContextStatus(noCrownState), "MATCH_READY");
});

// ---------------------------------------------------------------------------
// 6. Refunded / revoked entitlement can never be MATCH_READY.
// ---------------------------------------------------------------------------
test("6. a refunded or revoked CrownPrint never resolves to MATCH_READY", () => {
  for (const revoked of [
    { entitlementActive: false },
    { entitlementStatus: "refunded" },
    { entitlementStatus: "revoked" },
    { entitlementStatus: "chargeback" },
    { assessmentComplete: false },
    { resultsReady: false },
  ]) {
    const context = normalizeMatchContext(matchReadyPayload(revoked));
    const label = JSON.stringify(revoked);
    assert.equal(context.crownPrintPresent, false, `entitlement must not be usable: ${label}`);
    assert.deepEqual(context.matches, [], `matches must be dropped: ${label}`);
    assert.equal(deriveContextStatus(context), "NO_CROWNPRINT", label);

    const resolved = resolve({ integrationReady: true, context, requested: "MATCH_READY" });
    assert.notEqual(resolved.state, "MATCH_READY", label);
    assert.equal(resolved.showResults, false, `no results may render: ${label}`);
  }
});

// ---------------------------------------------------------------------------
// 7. Integration failure → unavailable, NEVER "you don't have a CrownPrint".
// ---------------------------------------------------------------------------
test("7. an integration failure resolves to unavailable, never to NO_CROWNPRINT", () => {
  const configured = resolve({ integrationReady: true, context: null, requested: parseConnectStatus("TEMPORARILY_UNAVAILABLE") });
  assert.equal(configured.state, "TEMPORARILY_UNAVAILABLE");
  assert.notEqual(configured.state, "NO_CROWNPRINT");

  // Not configured at all is its own state, still not a CrownPrint verdict.
  const unconfigured = resolve({ integrationReady: false, context: null, requested: "TEMPORARILY_UNAVAILABLE" });
  assert.equal(unconfigured.state, "INTEGRATION_UNAVAILABLE");
  assert.notEqual(unconfigured.state, "NO_CROWNPRINT");

  // A quiet failure with no marker at all still can't claim "no CrownPrint".
  const silent = resolve({ integrationReady: false, context: null, requested: null });
  assert.equal(silent.state, "INTEGRATION_UNAVAILABLE");
});

// ---------------------------------------------------------------------------
// 8. A completed CrownPrint returns to RESULTS — not the generic landing state.
//    This is the regression guard for the connect loop.
// ---------------------------------------------------------------------------
test("8. a completed CrownPrint lands on results, not the generic intro", () => {
  const context = normalizeMatchContext(matchReadyPayload());
  for (const requested of ["MATCH_READY", "connected", null]) {
    const resolved = resolve({ integrationReady: true, context, requested: parseReturnState(requested) });
    assert.equal(resolved.showResults, true, `requested=${requested}`);
    assert.notEqual(resolved.state, "CONNECT", `requested=${requested} must not fall back to the intro`);
    assert.notEqual(resolved.state, "NO_CROWNPRINT", `requested=${requested}`);
  }

  // The intro is reached ONLY when there is genuinely nothing resolved yet.
  const nothing = resolve({ integrationReady: true, context: null, requested: null });
  assert.equal(nothing.state, "CONNECT");
  assert.equal(nothing.showResults, false);

  // And a requested MATCH_READY can never manufacture results without a session.
  const noSession = resolve({ integrationReady: true, context: null, requested: "MATCH_READY" });
  assert.equal(noSession.showResults, false, "results require a real exchanged context");
});

// ---------------------------------------------------------------------------
// 9. The no-CrownPrint state carries the Premium $9.99 offer (copy lives in the
//    UI; here we prove the state that triggers it is reached and is distinct).
// ---------------------------------------------------------------------------
test("9. NO_CROWNPRINT is a distinct state from every other non-result outcome", () => {
  const states = new Set(
    ["NO_CROWNPRINT", "AUTH_REQUIRED", "CROWNSTATE_STALE", "TEMPORARILY_UNAVAILABLE"].map(
      (requested) => resolve({ integrationReady: true, context: null, requested }).state,
    ),
  );
  assert.equal(states.size, 4, "each outcome must resolve to its own state, not a shared fallback");
  assert.ok(states.has("NO_CROWNPRINT"));

  // Wynn-local hiccups (expired/failed link) are NOT a CrownPrint verdict — they
  // fall back to the intro with an explanatory note instead.
  for (const marker of ["EXPIRED", "ERROR", "CANCELLED", "DISCONNECTED"]) {
    const resolved = resolve({ integrationReady: true, context: null, requested: parseReturnState(marker) });
    assert.equal(resolved.state, "CONNECT", marker);
    assert.ok(resolved.note, `${marker} must explain itself`);
    assert.doesNotMatch(resolved.note, /don.t have a CrownPrint/i, `${marker} must not claim the shopper has no CrownPrint`);
  }
});

// ---------------------------------------------------------------------------
// 10. A CrownState refresh comes back with a NEW one-time code and refreshed
//     matches — and never re-charges.
// ---------------------------------------------------------------------------
test("10. a CrownState refresh returns to refreshed match results", () => {
  const before = normalizeMatchContext(matchReadyPayload({ crownState: { present: true, fresh: false } }));
  assert.equal(deriveContextStatus(before), "CROWNSTATE_STALE");

  // HWL saves the new CrownState, mints a NEW code, Wynn exchanges it once and
  // stores the refreshed context: the shopper is match-ready again.
  const after = normalizeMatchContext(
    matchReadyPayload({
      crownState: { present: true, fresh: true },
      currentPriorityLabel: "Rebuilding after color",
      matches: [{ productKey: "bond-repair", productName: "Bond Repair", matchClass: "strong", why: "Supports hair after a chemical service." }],
    }),
  );
  assert.equal(deriveContextStatus(after), "MATCH_READY");

  const resolved = resolve({ integrationReady: true, context: after, requested: "MATCH_READY" });
  assert.equal(resolved.state, "MATCH_READY");
  assert.equal(resolved.showResults, true);
  assert.equal(resolved.context, undefined, "the resolver returns state only");

  // A refresh never invalidates the CrownPrint itself, so it can never be turned
  // into a repeat purchase prompt.
  assert.equal(after.crownPrintPresent, true);
});

// ---------------------------------------------------------------------------
// 11. No sensitive CrownPrint data can cross into Wynn.
// ---------------------------------------------------------------------------
test("11. prohibited CrownPrint data never crosses the boundary", () => {
  const hostile = {
    ...matchReadyPayload(),
    userUuid: "8f14e45f-ea8f-4b2c-9c1a-000000000000",
    userId: 4242,
    email: "shopper@example.com",
    scores: { moisture: 0.87, protein: 0.42 },
    axisValues: { porosity: 3, density: 2 },
    weights: { moisture: 1.4 },
    thresholds: { strong: 0.8 },
    reasonCodes: ["CP-MOIST-14", "CP-SCALP-02"],
    rules: [{ id: "r1", expr: "moisture > 0.8" }],
    crownHistory: [{ service: "relaxer", date: "2026-01-04" }],
    crownStateDetail: { scalpTenderness: "high" },
    report: { summary: "Full CrownPrint Intelligence Report body." },
    reportUrl: "https://hairwellnesslab.example/report/8f14e45f",
    answers: [{ q: "How often do you wash?", a: "Weekly" }],
    rawAssessment: { q1: "a", q2: "c" },
    matches: [
      {
        productKey: "hydrating-leave-in",
        productName: "Hydrating Leave-In",
        matchClass: "strong",
        why: "Layers moisture without heaviness.",
        // Prohibited per-match internals.
        score: 0.93,
        weight: 1.4,
        reasonCodes: ["CP-MOIST-14"],
        axis: "moisture",
      },
    ],
  };

  const context = normalizeMatchContext(hostile);
  const serialized = JSON.stringify(context);

  for (const forbidden of [
    "8f14e45f", "4242", "shopper@example.com", "0.87", "0.93", "1.4", "0.8",
    "CP-MOIST-14", "CP-SCALP-02", "relaxer", "scalpTenderness", "Intelligence Report",
    "How often do you wash", "porosity", "moisture >",
  ]) {
    assert.ok(!serialized.includes(forbidden), `prohibited value crossed the boundary: ${forbidden}`);
  }

  for (const forbiddenKey of [
    "userUuid", "userId", "email", "scores", "axisValues", "axis", "weights", "thresholds",
    "reasonCodes", "rules", "crownHistory", "crownStateDetail", "report", "reportUrl", "answers",
    "rawAssessment", "score", "weight",
  ]) {
    assert.ok(!serialized.includes(`"${forbiddenKey}"`), `prohibited key crossed the boundary: ${forbiddenKey}`);
  }

  // The approved safe fields DID survive, so the whitelist isn't just dropping
  // everything.
  assert.equal(context.matches.length, 1);
  assert.equal(context.matches[0].productKey, "hydrating-leave-in");
  assert.equal(context.matches[0].matchClass, "strong");
  assert.equal(context.currentPriorityLabel, "Moisture retention after takedown");

  // Garbage in is a safe empty context out — never a thrown render.
  for (const junk of [null, undefined, "", 7, [], "MATCH_READY"]) {
    const empty = normalizeMatchContext(junk);
    assert.equal(empty.crownPrintPresent, false);
    assert.deepEqual(empty.matches, []);
    assert.equal(deriveContextStatus(empty), "NO_CROWNPRINT");
  }
});

// ---------------------------------------------------------------------------
// Parser hygiene: an unrecognized status is never guessed at, and HWL is never
// trusted to assert Wynn's own local markers.
// ---------------------------------------------------------------------------
test("unknown statuses resolve to null instead of being guessed", () => {
  for (const junk of ["", "  ", "banana", "MATCH_MAYBE", null, undefined, 12, {}]) {
    assert.equal(parseConnectStatus(junk), null, String(junk));
  }
  // HWL cannot assert Wynn-local markers on the connect hop...
  assert.equal(parseConnectStatus("EXPIRED"), null);
  assert.equal(parseConnectStatus("DISCONNECTED"), null);
  // ...but Wynn's own landing URL understands them.
  assert.equal(parseReturnState("EXPIRED"), "EXPIRED");
  assert.equal(parseReturnState("disconnected"), "DISCONNECTED");
  // Legacy lowercase links keep working.
  assert.equal(parseReturnState("connected"), "MATCH_READY");
  assert.equal(parseReturnState("temporarily_unavailable"), "TEMPORARILY_UNAVAILABLE");
});
