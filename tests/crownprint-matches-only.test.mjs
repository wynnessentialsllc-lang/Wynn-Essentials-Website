// HWL CONTRACT HARDENING — matches is the only source of product cards.
//
// THE INVARIANT
//
//   Every customer-facing CrownPrint product card's productKey exists in the
//   Hair Wellness Lab's canonical `matches` array.
//
// Wynn used to violate this. A table of regexes mapped resolved product-function
// labels onto Wynn slugs, and every hit became a "good" match card carrying a
// rationale that read exactly as authoritative as a real one. A shopper could be
// sold a cleanser because a coverage row said `cleanse_scalp`, or a bonnet
// because one said `reduce_surface_friction` — neither of which the Lab ever
// resolved for them.
//
// These tests pin the corrected contract from three directions:
//
//   1. coverage[] describes; it never selects. Not by functionKey, not by the
//      deprecated functionLabel, not by category wording.
//   2. accessories are a separate, explicitly-sourced channel — never produced
//      by formulation coverage, and never mixed into matches.
//   3. enforceMatchesOnly() is the last gate before render and fails CLOSED, so
//      even a future regression upstream cannot put an unauthorized product in
//      front of a shopper.

import assert from "node:assert/strict";
import test from "node:test";

import { LEGACY_COVERAGE_FIELDS_READABLE_UNTIL, normalizeMatchContext } from "../lib/crownprint-state.mjs";
import { enforceMatchesOnly, selectGuidance } from "../lib/crownprint-guidance.ts";
import { products } from "../app/data.ts";

const catalog = products;

const context = (overrides = {}) =>
  normalizeMatchContext({
    crownPrintPresent: true,
    entitlementActive: true,
    entitlementStatus: "active",
    assessmentComplete: true,
    resultsReady: true,
    crownPrintCode: "P2-D3-T3-S2-E2",
    crownState: { present: true, fresh: true, summary: "Loose natural, mid-wear, comfortable scalp" },
    ...overrides,
  });

// ---------------------------------------------------------------------------
// THE EXACT REGRESSION.
//
// P2-D3-T3-S2-E2, resolved priority "Strength & Protein Support". HWL resolves
// Revaivl as the match. Coverage additionally reports on two functions Wynn
// happens to have wording overlap with — and neither may produce a card.
// ---------------------------------------------------------------------------
const strengthAndProtein = () =>
  context({
    currentPriorityLabel: "Strength & Protein Support",
    currentPriorities: [{ label: "Strength & Protein Support", detail: "Elasticity is the limiting factor." }],
    productFunctionsNeeded: [
      { label: "Strength & Protein Support", detail: "Rebuild elasticity in coarse, dense strands." },
      { label: "Gentle cleansing", detail: "Without stripping." },
    ],
    // Descriptive coverage. `cleanse_scalp` overlaps Lathyr's wording;
    // `reduce_surface_friction` overlaps the Soft Life Bonnet's. Both are
    // reports, not instructions.
    coverage: [
      { functionKey: "strength_protein_support", functionLabel: "Strength & Protein Support", status: "covered" },
      { functionKey: "cleanse_scalp", functionLabel: "Gentle cleansing", status: "covered" },
      { functionKey: "reduce_surface_friction", functionLabel: "Reduce surface friction", status: "partial" },
    ],
    matches: [
      {
        productKey: "revaivl-protein-conditioner",
        productName: "Revaivl",
        matchClass: "strong",
        why: "Resolved by the Lab: protein support for low elasticity.",
      },
    ],
  });

test("P2-D3-T3-S2-E2 / Strength & Protein Support — Revaivl may render, from matches", () => {
  const guidance = selectGuidance({ context: strengthAndProtein(), catalog });
  const revaivl = guidance.matches.find((m) => m.productKey === "revaivl-protein-conditioner");
  assert.ok(revaivl, "the product HWL resolved must render");
  assert.equal(revaivl.matchClass, "strong", "and in HWL's own class, untouched");
});

test("P2-D3-T3-S2-E2 — Lathyr must NOT render merely because coverage contains cleanse_scalp", () => {
  const guidance = selectGuidance({ context: strengthAndProtein(), catalog });
  assert.equal(
    guidance.matches.some((m) => m.productKey === "lathyr-shampoo"),
    false,
    "a coverage row is a description of coverage, not a recommendation to render a cleanser",
  );
  // The coverage row is still reported — as coverage.
  assert.ok(
    guidance.coverage.some((c) => c.functionKey === "cleanse_scalp" && c.status === "covered"),
    "coverage still explains that the function was covered",
  );
});

test("P2-D3-T3-S2-E2 — Soft Life Bonnet must NOT render from reduce_surface_friction", () => {
  const guidance = selectGuidance({ context: strengthAndProtein(), catalog });
  assert.equal(
    guidance.matches.some((m) => m.productKey === "soft-life-bonnet"),
    false,
    "an accessory may never be conjured out of formulation coverage",
  );
  assert.deepEqual(guidance.accessories, [], "and no accessory channel was sent, so none renders");
  assert.ok(
    guidance.coverage.some((c) => c.functionKey === "reduce_surface_friction" && c.status === "partial"),
    "the function is reported as partially supported instead",
  );
});

test("the whole rendered set is a subset of HWL's matches", () => {
  const ctx = strengthAndProtein();
  const guidance = selectGuidance({ context: ctx, catalog });
  const authorized = new Set(ctx.matches.map((m) => m.productKey));
  for (const m of guidance.matches) {
    assert.ok(authorized.has(m.productKey), `${m.productKey} is not in HWL's matches array`);
  }
  assert.equal(guidance.matches.length, 1);
});

// ---------------------------------------------------------------------------
// coverage[] is structurally incapable of naming a product.
// ---------------------------------------------------------------------------
test("the boundary strips every product-identifying field from coverage", () => {
  const ctx = context({
    coverage: [
      {
        functionKey: "cleanse_scalp",
        functionLabel: "Gentle cleansing",
        status: "covered",
        // Everything below is a smuggling attempt and must not survive.
        productKey: "lathyr-shampoo",
        productKeys: ["lathyr-shampoo"],
        slug: "lathyr-shampoo",
        slugs: ["lathyr-shampoo"],
        products: [{ productKey: "lathyr-shampoo" }],
        recommend: true,
      },
    ],
    matches: [],
  });

  assert.deepEqual(ctx.coverage, [
    { functionKey: "cleanse_scalp", status: "covered", functionLabel: "Gentle cleansing" },
  ]);
  const serialized = JSON.stringify(ctx.coverage);
  assert.equal(/lathyr/.test(serialized), false, "no product identity may survive normalization");

  const guidance = selectGuidance({ context: ctx, catalog });
  assert.deepEqual(guidance.matches, [], "and nothing renders from it");
});

test("an unrecognized coverage status is dropped, never read as covered", () => {
  const ctx = context({
    coverage: [
      { functionKey: "seal_moisture", status: "probably_fine" },
      { functionKey: "cleanse_scalp", status: "not carried" },
    ],
    matches: [],
  });
  assert.deepEqual(ctx.coverage.map((c) => c.functionKey), ["cleanse_scalp"]);
  assert.equal(ctx.coverage[0].status, "not_carried", "legacy spellings still normalize");
});

test("coverage rows marked not_carried become gaps, not products", () => {
  const guidance = selectGuidance({
    context: context({
      coverage: [{ functionKey: "bond_repair", functionLabel: "Bond repair", status: "not_carried" }],
      matches: [],
    }),
    catalog,
  });
  assert.ok(guidance.gaps.some((g) => g.label === "Bond repair"));
  assert.deepEqual(guidance.matches, []);
});

// ---------------------------------------------------------------------------
// The deprecated display label: readable, never load-bearing.
// ---------------------------------------------------------------------------
test("functionLabel is readable but never selects; functionKey is the identifier", () => {
  // A label engineered to hit every retired regex at once. If any selection path
  // still reads functionLabel, this renders half the catalog.
  const ctx = context({
    coverage: [
      {
        functionKey: "opaque_key_1",
        functionLabel: "Cleansing shampoo, protein strength, sealing oil, scalp comfort, styling definition, satin friction",
        status: "covered",
      },
    ],
    matches: [],
  });
  const guidance = selectGuidance({ context: ctx, catalog });

  assert.deepEqual(guidance.matches, [], "the deprecated label selects nothing at all");
  assert.equal(guidance.coverage[0].label, ctx.coverage[0].functionLabel, "but it is still readable");
  assert.equal(guidance.coverage[0].functionKey, "opaque_key_1", "and the key stays the identifier");
});

test("the legacy-field sunset is pinned, and readability is what it grants", () => {
  // The deprecation window is a stated date, not folklore. Legacy display
  // fields stay READABLE until it passes; they were never selectable, and the
  // date does not change that either way.
  assert.equal(LEGACY_COVERAGE_FIELDS_READABLE_UNTIL, "2026-11-30");

  const guidance = selectGuidance({
    context: context({
      coverage: [{ functionKey: "seal_moisture", functionLabel: "Sealing", status: "covered" }],
      matches: [],
    }),
    catalog,
  });
  assert.equal(guidance.coverage[0].label, "Sealing", "readable through the window");
  assert.deepEqual(guidance.matches, [], "and never load-bearing, before or after it");
});

test("a coverage row with no functionLabel is still explainable from its key", () => {
  const guidance = selectGuidance({
    context: context({ coverage: [{ functionKey: "reduce_surface_friction", status: "partial" }], matches: [] }),
    catalog,
  });
  assert.equal(guidance.coverage[0].label, "Reduce surface friction");
  assert.deepEqual(guidance.matches, []);
});

// ---------------------------------------------------------------------------
// Accessories: a separate channel.
// ---------------------------------------------------------------------------
test("accessories render only from the explicit accessory source, and never as matches", () => {
  const ctx = context({
    accessories: [{ productKey: "soft-life-bonnet", why: "Protects the style overnight." }],
    coverage: [{ functionKey: "reduce_surface_friction", status: "partial" }],
    matches: [
      { productKey: "revaivl-protein-conditioner", productName: "Revaivl", matchClass: "strong", why: "Resolved." },
    ],
  });
  const guidance = selectGuidance({ context: ctx, catalog });

  assert.deepEqual(guidance.accessories.map((a) => a.productKey), ["soft-life-bonnet"]);
  assert.equal(
    guidance.matches.some((m) => m.productKey === "soft-life-bonnet"),
    false,
    "an accessory is never a CrownPrint product card",
  );
  assert.deepEqual(guidance.matches.map((m) => m.productKey), ["revaivl-protein-conditioner"]);
});

test("an accessory key that is not in the live catalog is dropped", () => {
  const guidance = selectGuidance({
    context: context({ accessories: [{ productKey: "not-a-real-product" }], matches: [] }),
    catalog,
  });
  assert.deepEqual(guidance.accessories, []);
});

// ---------------------------------------------------------------------------
// THE GUARD. This is what makes the answer NO rather than "not currently".
// ---------------------------------------------------------------------------
test("enforceMatchesOnly drops any card absent from the authorized matches array", () => {
  const authorized = [{ productKey: "revaivl-protein-conditioner" }];
  const cards = [
    { productKey: "revaivl-protein-conditioner" },
    { productKey: "lathyr-shampoo" },      // smuggled in from coverage
    { productKey: "soft-life-bonnet" },    // smuggled in from friction wording
  ];
  assert.deepEqual(
    enforceMatchesOnly(cards, authorized).map((c) => c.productKey),
    ["revaivl-protein-conditioner"],
  );
});

test("enforceMatchesOnly fails closed on an empty authorization", () => {
  assert.deepEqual(enforceMatchesOnly([{ productKey: "lathyr-shampoo" }], []), []);
});

test("enforceMatchesOnly passes the fallback through, where there is no HWL array", () => {
  // null means "no trusted context exists" — the manual-code page, which is
  // openly Wynn's own reasoning and has no HWL matches to be a subset of.
  const cards = [{ productKey: "lathyr-shampoo" }];
  assert.deepEqual(enforceMatchesOnly(cards, null), cards);
});

// ---------------------------------------------------------------------------
// The rendered page, end to end.
// ---------------------------------------------------------------------------
test("the guard composes with the guidance layer to hold the invariant", () => {
  const ctx = strengthAndProtein();
  const rendered = enforceMatchesOnly(selectGuidance({ context: ctx, catalog }).matches, ctx.matches);
  const renderedKeys = rendered.map((c) => c.productKey);
  const matchKeys = new Set(ctx.matches.map((m) => m.productKey));

  assert.ok(renderedKeys.every((k) => matchKeys.has(k)), "rendered ⊆ matches.productKey");
  assert.deepEqual(renderedKeys, ["revaivl-protein-conditioner"]);
});
