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
// THE FIVE RULES, as approved. Each has a named test immediately below, and the
// detailed cases further down exercise them against real payload shapes.
//
//   R1  Capability does not authorize a product card. Wynn being able to serve
//       a resolved function is not permission to render a product for it.
//   R2  `matches` is the sole authorization source. Nothing else grants a card.
//   R3  `coverage[]` is explanatory only — covered / partially supported /
//       not carried. It never selects, by any field.
//   R4  An empty `matches` array legitimately renders zero product cards. That
//       is a correct outcome, not a degraded one, and nothing may pad it.
//   R5  Accessories remain separate and explicit — their own sourced array,
//       their own section, never a formulation match.
//
// Plus the guarantee that keeps them true: enforceMatchesOnly() is the last gate
// before render and fails CLOSED, and R6 below fails if anyone reintroduces a
// function/label/category/capability-to-product lookup in the source.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
// THE FIVE RULES.
// ---------------------------------------------------------------------------

test("R1. capability does not authorize a product card", () => {
  // Every function here is one Wynn demonstrably can serve — it sells a
  // cleanser, a leave-in, a sealing oil and a scalp oil. HWL named a product for
  // exactly one of them. Capability covers all four; authorization covers one.
  const guidance = selectGuidance({
    context: context({
      productFunctionsNeeded: [
        { label: "Gentle cleansing" },
        { label: "Leave-in hydration" },
        { label: "Sealing" },
        { label: "Direct scalp care" },
      ],
      coverage: [
        { functionKey: "cleanse_scalp", status: "covered" },
        { functionKey: "leave_in_hydration", status: "covered" },
        { functionKey: "seal_moisture", status: "covered" },
        { functionKey: "scalp_care", status: "covered" },
      ],
      matches: [{ productKey: "relief-oil", productName: "Relief", matchClass: "strong", why: "Resolved." }],
    }),
    catalog,
  });

  assert.deepEqual(guidance.matches.map((m) => m.productKey), ["relief-oil"]);
  assert.equal(guidance.coverage.filter((c) => c.status === "covered").length, 4, "all four are reported covered");
  // Four "covered" verdicts, one card. That gap IS the rule.
});

test("R2. matches is the sole authorization source", () => {
  // Priorities, functions, coverage, notCarried and a CrownState summary are all
  // populated. None of them may grant a card. Only matches does.
  const ctx = context({
    currentPriorities: [{ label: "Strength & Protein Support" }],
    productFunctionsNeeded: [{ label: "Gentle cleansing" }, { label: "Sealing" }],
    coverage: [
      { functionKey: "cleanse_scalp", functionLabel: "Gentle cleansing", status: "covered" },
      { functionKey: "seal_moisture", functionLabel: "Sealing", status: "covered" },
    ],
    notCarried: [{ label: "A heat protectant" }],
    accessories: [{ productKey: "soft-life-bonnet" }],
    matches: [{ productKey: "revaivl-protein-conditioner", productName: "Revaivl", matchClass: "strong", why: "Resolved." }],
  });
  const guidance = selectGuidance({ context: ctx, catalog });

  assert.deepEqual(
    guidance.matches.map((m) => m.productKey),
    ctx.matches.map((m) => m.productKey),
    "the rendered set equals HWL's matches exactly — not a superset of it",
  );
});

test("R3. coverage[] is explanatory only", () => {
  const guidance = selectGuidance({
    context: context({
      coverage: [
        { functionKey: "cleanse_scalp", functionLabel: "Gentle cleansing", status: "covered" },
        { functionKey: "reduce_surface_friction", functionLabel: "Reduce surface friction", status: "partial" },
        { functionKey: "bond_repair", functionLabel: "Bond repair", status: "not_carried" },
      ],
      matches: [],
    }),
    catalog,
  });

  // It explains, in exactly the three permitted vocabularies.
  assert.deepEqual(
    guidance.coverage.map((c) => c.status),
    ["covered", "partial", "not_carried"],
  );
  // And it selects nothing, in any of the three states.
  assert.deepEqual(guidance.matches, [], "no status, not even 'covered', produces a card");
  assert.deepEqual(guidance.accessories, [], "and 'partial' on a friction function produces no accessory");
});

test("R4. an empty matches array legitimately renders zero product cards", () => {
  const guidance = selectGuidance({
    context: context({
      productFunctionsNeeded: [{ label: "Gentle cleansing" }, { label: "Sealing" }, { label: "Direct scalp care" }],
      coverage: [
        { functionKey: "cleanse_scalp", status: "covered" },
        { functionKey: "seal_moisture", status: "covered" },
        { functionKey: "scalp_care", status: "covered" },
      ],
      matches: [],
    }),
    catalog,
  });

  // Zero is the correct answer here, not a failure to be padded around.
  assert.deepEqual(guidance.matches, []);
  assert.equal(guidance.noFit, true, "and it reports itself honestly");
  assert.equal(guidance.noStrongMatch, true);
  // The page is still explicable: the shopper sees what was needed and how it
  // was covered, without a single unauthorized product.
  assert.equal(guidance.functions.length, 3);
  assert.equal(guidance.coverage.length, 3);
});

test("R5. accessories remain separate and explicit", () => {
  const guidance = selectGuidance({
    context: context({
      // A friction coverage row AND an explicit accessory. Only the explicit one
      // may produce anything, and never as a match.
      coverage: [{ functionKey: "reduce_surface_friction", status: "partial" }],
      accessories: [{ productKey: "soft-life-bonnet", why: "Protects the style overnight." }],
      matches: [{ productKey: "revaivl-protein-conditioner", productName: "Revaivl", matchClass: "strong", why: "Resolved." }],
    }),
    catalog,
  });

  assert.deepEqual(guidance.accessories.map((a) => a.productKey), ["soft-life-bonnet"]);
  assert.deepEqual(guidance.matches.map((m) => m.productKey), ["revaivl-protein-conditioner"]);
  assert.equal(
    guidance.matches.some((m) => m.productKey === "soft-life-bonnet"),
    false,
    "an accessory is never a CrownPrint formulation match",
  );
});

// ---------------------------------------------------------------------------
// R6. The fallback stays gone.
//
// A source-level check, deliberately. The behavioral tests above prove the
// current code does not convert functions into products; this one fails when
// someone writes the machinery to do it again, even before it is wired up.
// ---------------------------------------------------------------------------
test("R6. no function/label/category-to-product lookup exists in the CrownPrint libs", async () => {
  const url = (p) => new URL(p, import.meta.url);
  const fit = await readFile(url("../lib/crownprint-fit.ts"), "utf8");
  const guidance = await readFile(url("../lib/crownprint-guidance.ts"), "utf8");

  for (const gone of ["CATALOG_CAPABILITIES", "matchFunctionsToCatalog", "FunctionCoverage"]) {
    assert.equal(
      new RegExp(`^(?!\\s*(//|\\*)).*\\b${gone}\\b`, "m").test(fit),
      false,
      `${gone} is back in lib/crownprint-fit.ts as live code — the retired lookup must not return`,
    );
    assert.equal(
      new RegExp(`^(?!\\s*(//|\\*)).*\\b${gone}\\b`, "m").test(guidance),
      false,
      `${gone} is back in lib/crownprint-guidance.ts as live code`,
    );
  }

  // The trusted path must never push into matches after HWL's own array is
  // mapped. Any `matches.push(` in the guidance layer is that pattern returning.
  assert.equal(
    /^(?!\s*(\/\/|\*)).*matches\.push\(/m.test(guidance),
    false,
    "nothing may be appended to matches after HWL's array is consumed",
  );
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
