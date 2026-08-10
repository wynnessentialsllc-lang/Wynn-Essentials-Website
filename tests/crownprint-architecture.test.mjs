import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeCrownState, parseCrownPrintCode } from "../lib/crownprint-code.ts";
import { crownStateAction, normalizeMatchContext, shouldCollectCrownState } from "../lib/crownprint-state.mjs";
import { hasTrusted360, selectGuidance } from "../lib/crownprint-guidance.ts";
import { products } from "../app/data.ts";

// ---------------------------------------------------------------------------
// The division of authority.
//
//   Hair Wellness Lab = CrownPrint intelligence authority
//   Wynn Essentials   = catalog matching / commerce authority
//
// These tests pin the boundary itself: what wins when both a trusted CrownPrint
// 360 context and a locally typed code are available, what the fallback is
// allowed to claim, and what a partial code is NOT allowed to claim.
// ---------------------------------------------------------------------------

const catalog = products;

const profile = (code, state = {}) => ({
  core: parseCrownPrintCode(code).core,
  state: normalizeCrownState(state),
});

/** A fully resolved CrownPrint 360, shaped like a real HWL response. */
const resolved360 = (overrides = {}) =>
  normalizeMatchContext({
    crownPrintPresent: true,
    entitlementActive: true,
    entitlementStatus: "active",
    assessmentComplete: true,
    resultsReady: true,
    crownPrintCode: "P2-D3-T3-S2-E2",
    crownState: { present: true, fresh: true, summary: "Braids, nearing takedown, tender scalp" },
    currentPriorityLabel: "Scalp comfort",
    currentPriorities: [
      { label: "Scalp comfort", detail: "The scalp is the limiting factor right now." },
      { label: "Moisture balance", detail: "Retention, not application, is the lever." },
    ],
    productFunctionsNeeded: [
      { label: "Scalp comfort care", detail: "Applied directly to the parts while styled." },
      { label: "Water-based daily moisture", detail: "Something light enough to reach through braids." },
      { label: "A bond-repair treatment", detail: "For structural damage from chemical processing." },
    ],
    notCarried: [{ label: "A heat protectant", detail: "Needed before any pressing." }],
    matches: [
      { productKey: "relief-oil", productName: "Relief", matchClass: "strong", why: "Resolved by the Lab: your scalp is the priority." },
    ],
    // Prohibited fields, included deliberately: the boundary must still drop them.
    userUuid: "3f7c…",
    rawScores: { porosity: 0.62 },
    ...overrides,
  });

// ---------------------------------------------------------------------------
// 1. A trusted 360 context outranks local Core-only reconstruction.
// ---------------------------------------------------------------------------
test("1. a trusted CrownPrint 360 outranks any local Core reconstruction", () => {
  const context = resolved360();
  const local = profile("P2-D3-T3-S2-E2", { style: "braids", scalp: "tender", concern: "dryness" });

  // Both available. The 360 must win outright.
  const guidance = selectGuidance({ context, profile: local, catalog });
  assert.equal(guidance.source, "crownprint-360");
  assert.equal(guidance.isFallback, false);
  assert.equal(guidance.confidence, "full");
  assert.match(guidance.label, /Hair Wellness Lab/);

  // The priorities and functions are HWL's, verbatim — not Wynn's own wording.
  assert.deepEqual(guidance.priorities.map((p) => p.label), ["Scalp comfort", "Moisture balance"]);
  assert.deepEqual(guidance.functions.map((f) => f.label), [
    "Scalp comfort care",
    "Water-based daily moisture",
    "A bond-repair treatment",
  ]);

  // HWL's own match keeps HWL's own reason and class.
  const relief = guidance.matches.find((m) => m.productKey === "relief-oil");
  assert.equal(relief.matchClass, "strong");
  assert.match(relief.why, /Resolved by the Lab/);

  // And the local engine's wording is nowhere in the result.
  const localGuidance = selectGuidance({ profile: local, catalog });
  assert.equal(localGuidance.source, "core");
  assert.notEqual(guidance.matches.length, 0);
  const localReliefWhy = localGuidance.matches.find((m) => m.productKey === "relief-oil")?.why;
  assert.notEqual(relief.why, localReliefWhy, "the 360 result must not carry Wynn's locally derived reasoning");
});

test("1b. resolved functions are DESCRIBED, never turned into product cards", () => {
  const guidance = selectGuidance({ context: resolved360(), catalog });

  // HWL resolved exactly one product: Relief. Three product functions were named
  // alongside it, and under the old contract Wynn keyword-matched those labels
  // into extra cards. It no longer does. What HWL matched is what renders.
  assert.deepEqual(
    guidance.matches.map((m) => m.productKey),
    ["relief-oil"],
    "matches is HWL's array and nothing else",
  );

  // "Water-based daily moisture" used to pull in the Hydrate mist by label.
  assert.equal(
    guidance.matches.some((m) => m.productKey === "hydrate-herbal-hair-mist"),
    false,
    "a resolved function label must not manufacture a product card",
  );

  // The functions themselves are still shown — as functions, which is what they
  // are. Describing a need is not recommending a product for it.
  assert.ok(
    guidance.functions.some((f) => f.label === "Water-based daily moisture"),
    "the resolved function is still surfaced to the shopper",
  );

  // HWL's own not-carried verdict still reads through.
  assert.ok(
    guidance.gaps.map((g) => g.label).includes("A heat protectant"),
    "HWL's own notCarried must be carried through",
  );
  assert.equal(
    guidance.matches.some((m) => m.productKey === "revaivl-protein-conditioner"),
    false,
    "a bond builder must not be approximated with a protein conditioner",
  );
  assert.equal(
    guidance.matches.some((m) => m.productKey === "thairap-moisture-styling-cream"),
    false,
    "a styling cream must not be pulled in by the wording of a scalp-care function",
  );
});

// ---------------------------------------------------------------------------
// 2. The local fallback works with no HWL at all.
// ---------------------------------------------------------------------------
test("2. /crownprint works as a fallback with no HWL context whatsoever", () => {
  const guidance = selectGuidance({
    context: null,
    profile: profile("P3-D1-T1-S1-E1", { style: "braids", scalp: "flaky", concern: "dryness" }),
    catalog,
  });

  assert.equal(guidance.source, "core");
  assert.equal(guidance.isFallback, true);
  assert.ok(guidance.matches.length > 0, "a complete code must still produce real matches offline");
  assert.ok(guidance.priorities.length > 0);
  assert.ok(guidance.functions.length > 0);
  assert.equal(guidance.code, "P3-D1-T1-S1-E1");

  // And it never claims to be the full Blueprint.
  assert.match(guidance.detail, /isn't your full CrownPrint 360|not your full CrownPrint 360/i);
});

test("2b. an unusable context is not treated as trusted", () => {
  // Refunded entitlement: HWL sent matches, but the CrownPrint is not usable.
  const revoked = normalizeMatchContext({
    crownPrintPresent: true,
    entitlementStatus: "refunded",
    crownState: { present: true, fresh: true },
    matches: [{ productKey: "relief-oil", productName: "Relief", matchClass: "strong", why: "…" }],
  });
  assert.equal(hasTrusted360(revoked), false);
  const guidance = selectGuidance({ context: revoked, profile: profile("P3"), catalog });
  assert.equal(guidance.source, "core-partial", "a revoked CrownPrint falls back, it does not resolve");
  assert.equal(guidance.matches.some((m) => m.why === "…"), false, "no match may survive a revoked entitlement");
});

// ---------------------------------------------------------------------------
// 3 + 4. Partial codes downgrade, and missing axes are never inferred.
// ---------------------------------------------------------------------------
test("3. a partial code cannot reach the same confidence as a complete one", () => {
  const state = { style: "braids", scalp: "tender", concern: "dryness" };
  const complete = selectGuidance({ profile: profile("P2-D3-T3-S2-E2", state), catalog });
  const partial = selectGuidance({ profile: profile("P2-T3", state), catalog });

  assert.equal(complete.source, "core");
  assert.equal(complete.confidence, "full");
  assert.equal(partial.source, "core-partial");
  assert.equal(partial.confidence, "reduced");

  // The missing axes are named, in the UI-facing payload.
  assert.deepEqual(partial.missingAxes.map((a) => a.letter).sort(), ["D", "E", "S"]);
  assert.match(partial.detail, /Density|Scalp Type|Elasticity/);

  // Products whose reasoning leans on a missing axis are held back from strong.
  for (const match of partial.matches) {
    if (match.limitedBy?.length) {
      assert.notEqual(match.matchClass, "strong", `${match.productKey} depends on a missing axis and cannot be strong`);
    }
  }
  const completeStrong = complete.matches.filter((m) => m.matchClass === "strong").map((m) => m.productKey);
  const partialStrong = partial.matches.filter((m) => m.matchClass === "strong").map((m) => m.productKey);
  assert.ok(
    partialStrong.length < completeStrong.length,
    "a partial code must not produce as many strong matches as the complete one",
  );
});

test("3b. a code with no axes at all is the weakest context, and says so", () => {
  const guidance = selectGuidance({ profile: profile("", { concern: "dryness" }), catalog });
  assert.equal(guidance.source, "crownstate-only");
  assert.equal(guidance.confidence, "limited");
  assert.equal(guidance.matches.some((m) => m.matchClass === "strong"), false);
});

test("4. a missing axis is never inferred, and never spoken about as if known", () => {
  // Elasticity absent. Revaivl's caution ("your CrownPrint doesn't flag a
  // strength problem") is an assertion about elasticity — it must be suppressed
  // rather than stated on evidence we were never given.
  const withoutE = selectGuidance({ profile: profile("P2-D3-T3-S2", { concern: "dryness" }), catalog });
  const revaivlWithout = withoutE.matches.find((m) => m.productKey === "revaivl-protein-conditioner");
  if (revaivlWithout) {
    assert.equal(revaivlWithout.caution, undefined, "no claim about elasticity may be made when elasticity is unknown");
  }

  // With elasticity present, the same caution is legitimate and appears.
  const withE = selectGuidance({ profile: profile("P2-D3-T3-S2-E2", { concern: "dryness" }), catalog });
  const revaivlWith = withE.matches.find((m) => m.productKey === "revaivl-protein-conditioner");
  if (revaivlWith) assert.match(revaivlWith.caution ?? "", /occasional|month/i);

  // The Core itself is never back-filled with a default.
  const parsed = parseCrownPrintCode("P2-T3");
  assert.equal(parsed.core.density, undefined);
  assert.equal(parsed.core.scalp, undefined);
  assert.equal(parsed.core.elasticity, undefined);
  assert.equal(selectGuidance({ profile: profile("P2-T3"), catalog }).code, "P2-T3", "the code is never padded out");
});

// ---------------------------------------------------------------------------
// 5 + 6. CrownState: never re-asked when fresh; the right path when stale.
// ---------------------------------------------------------------------------
test("5. a fresh trusted CrownState is never re-asked on Wynn", () => {
  const context = resolved360();
  assert.equal(crownStateAction(context), "none");
  assert.equal(shouldCollectCrownState(context), false);
  assert.equal(selectGuidance({ context, catalog }).crownStatePolicy, "none");
});

test("6. a stale CrownState routes to HWL's free update, not a Wynn questionnaire", () => {
  const stale = resolved360({ crownState: { present: true, fresh: false, message: "Your hair needs may have changed." } });
  assert.equal(crownStateAction(stale), "refresh");
  assert.equal(shouldCollectCrownState(stale), false, "stale is still trusted context — never re-ask it here");

  const guidance = selectGuidance({ context: stale, catalog });
  assert.equal(guidance.crownStatePolicy, "refresh");
  assert.equal(guidance.source, "crownprint-360", "stale context is still HWL's, not a reason to fall back locally");
  assert.ok(guidance.notes.some((n) => /changed|out of date/i.test(n)));
});

test("6b. only the fallback may ask, and it asks the minimum", async () => {
  assert.equal(crownStateAction(null), "ask");
  assert.equal(selectGuidance({ profile: profile("P2-D3-T3-S2-E2"), catalog }).crownStatePolicy, "ask");

  const { STATE_FIELDS } = await import("../lib/crownprint-code.ts");
  const essential = STATE_FIELDS.filter((f) => f.essential);
  assert.ok(essential.length <= 3, "the fallback must not become a second full questionnaire");
  assert.deepEqual(essential.map((f) => f.id).sort(), ["concern", "scalpNow", "style"]);
});

// ---------------------------------------------------------------------------
// 7 + 8. Honest results survive the architecture change.
// ---------------------------------------------------------------------------
test("7. no-fit is still reachable through the arbiter", () => {
  const guidance = selectGuidance({ profile: profile("S2"), catalog });
  assert.equal(guidance.noFit, true);
  assert.equal(guidance.matches.length, 0);
  assert.ok(guidance.whatToLookFor.hairNeed.length > 40, "a no-fit result still has to be useful");
});

test("8. conditional matches are never promoted to fill out a thin result", () => {
  const thin = selectGuidance({ profile: profile("", { style: "braids" }), catalog });
  // Whatever this profile yields, nothing may be inflated to pad the page.
  assert.equal(thin.matches.some((m) => m.matchClass === "strong"), false);
  for (const m of thin.matches) {
    assert.ok(["good", "conditional"].includes(m.matchClass));
  }

  // And a 360 whose only resolved match is conditional stays conditional.
  const context = resolved360({
    matches: [{ productKey: "edge-control", productName: "Edge Control", matchClass: "conditional", why: "Resolved as conditional." }],
    productFunctionsNeeded: [],
    notCarried: [],
  });
  const guidance = selectGuidance({ context, catalog });
  assert.equal(guidance.matches.find((m) => m.productKey === "edge-control").matchClass, "conditional");
  assert.equal(guidance.noStrongMatch, true);
});

// ---------------------------------------------------------------------------
// The richer 360 contract, consumed as HWL now sends it.
// ---------------------------------------------------------------------------
test("8b. a not-carried function can never become a Wynn product recommendation", () => {
  // HWL says a bond-repair treatment is needed and that we don't carry it. The
  // wording overlaps our protein conditioner ("strengthening"), so only HWL's
  // verdict keeps it out of the matches.
  const context = resolved360({
    productFunctionsNeeded: [
      { label: "Protein or strengthening treatment", detail: "Bond repair for chemically processed hair." },
      { label: "Sealing", detail: "Hold the moisture in." },
    ],
    notCarried: [{ label: "Protein or strengthening treatment", detail: "A bond builder is a different category." }],
    matches: [],
  });
  const guidance = selectGuidance({ context, catalog });

  assert.equal(
    guidance.matches.some((m) => m.productKey === "revaivl-protein-conditioner"),
    false,
    "HWL said we don't carry this — no keyword overlap may override that",
  );
  assert.ok(guidance.gaps.some((g) => /strengthening/i.test(g.label)), "it stays a gap");
  // And "Sealing" — a function we plainly could serve — still yields no card,
  // because HWL named no product for it. Capability is not authorization.
  assert.equal(
    guidance.matches.some((m) => m.productKey === "nourish-oil"),
    false,
    "a function Wynn could serve is still not a product HWL resolved",
  );
});

test("8c. no HWL matches means no product cards, however many functions were resolved", () => {
  const context = resolved360({
    // HWL resolved four functions and named NO products. Under the old contract
    // Wynn filled all four from its own catalog. That was Wynn inventing a
    // recommendation the Lab never made.
    matches: [],
    productFunctionsNeeded: [
      { label: "Gentle cleansing" },
      { label: "Leave-in hydration" },
      { label: "Sealing" },
      { label: "Direct scalp care" },
    ],
    notCarried: [],
  });
  const guidance = selectGuidance({ context, catalog });

  assert.deepEqual(guidance.matches, [], "an empty matches array renders an empty result");
  assert.equal(guidance.noFit, true, "and that reads honestly as no fit");
  assert.equal(guidance.noStrongMatch, true);
  // The functions are still described, so the page explains itself rather than
  // going silently blank.
  assert.equal(guidance.functions.length, 4);
});

test("8d. HWL's own classes are carried through untouched", () => {
  const context = resolved360({
    matches: [
      { productKey: "relief-oil", productName: "Relief", matchClass: "strong", why: "Resolved strong by the Lab." },
      { productKey: "grow-oil", productName: "Grow", matchClass: "conditional", why: "Resolved conditional by the Lab." },
    ],
    productFunctionsNeeded: [],
    notCarried: [],
  });
  const guidance = selectGuidance({ context, catalog });
  assert.equal(guidance.matches.find((m) => m.productKey === "relief-oil").matchClass, "strong");
  assert.equal(guidance.matches.find((m) => m.productKey === "grow-oil").matchClass, "conditional");
  assert.equal(guidance.noStrongMatch, false);
});

test("8e. the resolved code, priorities and functions render from HWL, not from Wynn", () => {
  const guidance = selectGuidance({ context: resolved360(), catalog });
  assert.equal(guidance.code, "P2-D3-T3-S2-E2", "the code shown is the one HWL resolved");
  assert.deepEqual(guidance.priorities.map((p) => p.label), ["Scalp comfort", "Moisture balance"]);
  assert.equal(guidance.source, "crownprint-360");
  assert.equal(guidance.confidence, "full");
});

// ---------------------------------------------------------------------------
// 9. Connect security is untouched by any of this.
// ---------------------------------------------------------------------------
test("9. the secure callback verification is unchanged", async () => {
  const route = await readFile(new URL("../app/shop-by-crownprint/connect/route.ts", import.meta.url), "utf8");
  const lib = await readFile(new URL("../lib/crownprint.ts", import.meta.url), "utf8");

  // The CSRF marker is still consumed and still gates the exchange.
  const pendingAt = route.indexOf("await consumePending()");
  const exchangeAt = route.indexOf("exchangeConnectCode(");
  assert.ok(pendingAt > -1 && exchangeAt > pendingAt, "the pending check must still precede the exchange");
  assert.match(route, /if \(pending !== "ok"\)/, "anything but a valid pending marker must still stop the exchange");
  assert.equal((route.match(/exchangeConnectCode\(/g) || []).length, 1, "still exactly one exchange");

  // Still HMAC-signed, still one request, still no bearer token.
  assert.equal((lib.match(/await fetch\(/g) || []).length, 1);
  assert.match(lib, /X-Wynn-Signature/);
  assert.doesNotMatch(lib, /Authorization:\s*`?Bearer/i);

  // The new resolved fields did not loosen the boundary whitelist.
  const context = resolved360();
  assert.equal("userUuid" in context, false);
  assert.equal("rawScores" in context, false);
  assert.equal(context.crownPrintCode, "P2-D3-T3-S2-E2");

  // A malformed code from HWL is dropped rather than rendered.
  const bad = normalizeMatchContext({
    crownPrintPresent: true,
    crownState: { present: true, fresh: true },
    crownPrintCode: "<script>alert(1)</script>",
    matches: [],
  });
  assert.equal(bad.crownPrintCode, undefined);
});
