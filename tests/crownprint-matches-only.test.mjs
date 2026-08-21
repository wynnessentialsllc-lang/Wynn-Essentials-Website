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
import {
  HWL_CANONICAL_PRODUCT_KEYS,
  HWL_PRODUCT_KEY_ALIASES,
  resolveCatalogSlug,
} from "../lib/crownprint-catalog-key.ts";
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
// THE AUTHORIZED → RENDERED PATH.
//
// Production acceptance passed the guard (subset: true, violations: []) and
// still rendered nothing: authorizedKeys ["revaivl"], renderedKeys []. HWL names
// the product `revaivl`; the Wynn catalog slug is `revaivl-protein-conditioner`.
// The bare `catalog.has(productKey)` join dropped it — silently — before
// enforceMatchesOnly() ever saw a candidate.
//
// The rule these pin: an authorized product that EXISTS in the catalog must
// reach the page. Dropping it is as much a defect as rendering an unauthorized
// one; it is simply the failure that does not trip a subset check.
// ---------------------------------------------------------------------------
test("ACCEPTANCE: authorizedKeys ['revaivl'] + catalog contains Revaivl → renderedKeys ['revaivl']", () => {
  const ctx = context({
    currentPriorityLabel: "Strength & Protein Support",
    matches: [{ productKey: "revaivl", productName: "Revaivl", matchClass: "strong", why: "Resolved by the Lab." }],
  });

  const authorizedKeys = ctx.matches.map((m) => m.productKey);
  const rendered = enforceMatchesOnly(selectGuidance({ context: ctx, catalog }).matches, ctx.matches)
    .filter((m) => catalog.some((p) => p.slug === m.catalogSlug));
  const renderedKeys = rendered.map((m) => m.productKey);
  const violations = renderedKeys.filter((k) => !authorizedKeys.includes(k));

  // The exact production assertion, in both directions.
  assert.deepEqual(authorizedKeys, ["revaivl"]);
  assert.deepEqual(renderedKeys, ["revaivl"], "the authorized product must reach the page");
  assert.deepEqual(authorizedKeys, renderedKeys, "authorizedKeys === renderedKeys");
  assert.deepEqual(violations, [], "and nothing unauthorized came with it");

  // It renders as the real catalog product, with HWL's class untouched.
  assert.equal(rendered[0].catalogSlug, "revaivl-protein-conditioner");
  assert.equal(rendered[0].matchClass, "strong");
  assert.ok(catalog.some((p) => p.slug === rendered[0].catalogSlug), "and that slug is really in the catalog");
});

test("the audit's own failure mode: authorized-but-unrendered is caught, not hidden by subset", () => {
  // A key that resolves to nothing real. subset stays TRUE — an empty rendered
  // set is trivially a subset — which is exactly why unresolvedKeys exists.
  const ctx = context({
    matches: [{ productKey: "a-product-we-no-longer-carry", productName: "Gone", matchClass: "strong", why: "Resolved." }],
  });
  const authorizedKeys = ctx.matches.map((m) => m.productKey);
  const renderedKeys = enforceMatchesOnly(selectGuidance({ context: ctx, catalog }).matches, ctx.matches)
    .map((m) => m.productKey);

  assert.deepEqual(renderedKeys, []);
  assert.equal(renderedKeys.every((k) => authorizedKeys.includes(k)), true, "subset is still true");
  assert.deepEqual(
    authorizedKeys.filter((k) => !renderedKeys.includes(k)),
    ["a-product-we-no-longer-carry"],
    "unresolvedKeys is what surfaces it",
  );
});

// ---------------------------------------------------------------------------
// COMPLETENESS. Every key in HWL's frozen vocabulary (PR #640) must land on a
// real Wynn product — by slug or by explicit alias. A key that resolves only by
// the product-name fallback is not covered: names change for merchandising
// reasons, and the shopper loses the product the day one does.
// ---------------------------------------------------------------------------
test("COMPLETENESS: every canonical HWL key resolves directly or via an explicit alias", () => {
  const slugs = new Set(catalog.map((p) => p.slug));
  const aliasIndex = new Map(
    Object.entries(HWL_PRODUCT_KEY_ALIASES).map(([k, v]) => [k.toLowerCase(), v]),
  );

  assert.equal(HWL_CANONICAL_PRODUCT_KEYS.length, 11, "the frozen vocabulary is eleven keys");

  const unresolved = [];
  for (const key of HWL_CANONICAL_PRODUCT_KEYS) {
    const lower = key.toLowerCase();
    const direct = slugs.has(lower);
    const aliased = aliasIndex.has(lower);

    // ONLY these two satisfy completeness. Resolution runs slug → alias → name,
    // so proving one of the first two hits proves the name fallback is never
    // reached for a canonical key: it may stay as defence, but the integration
    // does not rest on it. A product renamed for merchandising reasons must not
    // be able to break the bridge.
    assert.ok(
      direct || aliased,
      `"${key}" resolves by neither slug nor alias — it would fall through to display-name matching, which is not a contract`,
    );

    const resolved = resolveCatalogSlug(key, catalog);
    if (!resolved || !slugs.has(resolved)) unresolved.push(key);
  }
  assert.deepEqual(unresolved, [], "unresolved canonical keys must be none");
});

test("COMPLETENESS: no canonical key depends on display-name matching", () => {
  // The direct proof: resolve every canonical key against a catalog whose
  // product NAMES have all been replaced. Slug and alias resolution are
  // unaffected; anything that was secretly leaning on the name fallback breaks.
  const renamed = catalog.map((p, i) => ({ ...p, name: `Renamed Product ${i}` }));

  for (const key of HWL_CANONICAL_PRODUCT_KEYS) {
    assert.ok(
      resolveCatalogSlug(key, renamed),
      `"${key}" stopped resolving when product names changed — it was depending on display-name matching`,
    );
    assert.equal(
      resolveCatalogSlug(key, renamed),
      resolveCatalogSlug(key, catalog),
      `"${key}" resolves differently once names change`,
    );
  }
});

test("COMPLETENESS: the alias table is one-to-one and points only at live products", () => {
  const slugs = new Set(catalog.map((p) => p.slug));
  const targets = Object.values(HWL_PRODUCT_KEY_ALIASES);

  for (const [key, slug] of Object.entries(HWL_PRODUCT_KEY_ALIASES)) {
    assert.ok(slugs.has(slug), `alias "${key}" points at "${slug}", which the catalog no longer carries`);
  }
  assert.equal(
    new Set(targets).size,
    targets.length,
    "two HWL keys map to the same product — the mapping must be one-to-one",
  );
  // The frozen contract, asserted literally. All eleven canonical keys.
  assert.deepEqual(HWL_PRODUCT_KEY_ALIASES, {
    hydrateMist: "hydrate-herbal-hair-mist",
    therapi: "thairap-moisture-styling-cream",
    lathyr: "lathyr-shampoo",
    uplyft: "uplyft-conditioner",
    revaivl: "revaivl-protein-conditioner",
    nourishOil: "nourish-oil",
    growOil: "grow-oil",
    reliefOil: "relief-oil",
    scrunchieSet: "heritage-hold-scrunchie-set",
    edgeControl: "edge-control",
    softLifeBonnet: "soft-life-bonnet",
  });
});

// ---------------------------------------------------------------------------
// The two new keys, against the channel separation. Resolving a key must not
// change which channel it may enter through.
// ---------------------------------------------------------------------------
test("edgeControl cannot enter unless present in authoritative matches", () => {
  // It resolves perfectly. It is still not authorized.
  assert.equal(resolveCatalogSlug("edgeControl", catalog), "edge-control", "resolvable…");

  const ctx = context({
    productFunctionsNeeded: [{ label: "Edge definition" }],
    coverage: [{ functionKey: "lay_edges", functionLabel: "Edge definition", status: "covered" }],
    matches: [{ productKey: "revaivl", productName: "Revaivl", matchClass: "strong", why: "Resolved." }],
  });
  const guidance = selectGuidance({ context: ctx, catalog });

  assert.equal(
    guidance.matches.some((m) => m.catalogSlug === "edge-control"),
    false,
    "…and a covered edge function still does not authorize it",
  );
  assert.deepEqual(
    enforceMatchesOnly([{ productKey: "edgeControl", catalogSlug: "edge-control" }], ctx.matches),
    [],
    "the guard blocks it at the render boundary too",
  );

  // Present in matches, it renders — in HWL's vocabulary, at HWL's class.
  const authorized = context({
    matches: [{ productKey: "edgeControl", productName: "Edge Control", matchClass: "good", why: "Resolved." }],
  });
  const ok = selectGuidance({ context: authorized, catalog });
  assert.deepEqual(ok.matches.map((m) => m.productKey), ["edgeControl"]);
  assert.deepEqual(ok.matches.map((m) => m.catalogSlug), ["edge-control"]);
  assert.equal(ok.matches[0].matchClass, "good");
});

test("softLifeBonnet renders only from the accessory channel, never from formulation coverage", () => {
  // Coverage naming the friction function, and nothing in the accessory array.
  const coverageOnly = selectGuidance({
    context: context({
      coverage: [{ functionKey: "reduce_surface_friction", functionLabel: "Reduce surface friction", status: "partial" }],
      matches: [{ productKey: "revaivl", productName: "Revaivl", matchClass: "strong", why: "Resolved." }],
    }),
    catalog,
  });
  assert.deepEqual(coverageOnly.accessories, [], "coverage produces no accessory");
  assert.equal(
    coverageOnly.matches.some((m) => m.catalogSlug === "soft-life-bonnet"),
    false,
    "and no formulation match",
  );

  // The explicit channel, in HWL's vocabulary — this is the only way through.
  const explicit = selectGuidance({
    context: context({
      accessories: [{ productKey: "softLifeBonnet", why: "Protects the style overnight." }],
      matches: [{ productKey: "revaivl", productName: "Revaivl", matchClass: "strong", why: "Resolved." }],
    }),
    catalog,
  });
  assert.deepEqual(explicit.accessories.map((a) => a.productKey), ["softLifeBonnet"]);
  assert.deepEqual(explicit.accessories.map((a) => a.catalogSlug), ["soft-life-bonnet"]);
  assert.equal(
    explicit.matches.some((m) => m.catalogSlug === "soft-life-bonnet"),
    false,
    "an accessory never joins the formulation matches",
  );
  assert.deepEqual(explicit.matches.map((m) => m.productKey), ["revaivl"]);
});

test("COMPLETENESS: aliases resolve regardless of the casing HWL sends", () => {
  assert.equal(resolveCatalogSlug("hydrateMist", catalog), "hydrate-herbal-hair-mist");
  assert.equal(resolveCatalogSlug("hydratemist", catalog), "hydrate-herbal-hair-mist");
  assert.equal(resolveCatalogSlug("HYDRATEMIST", catalog), "hydrate-herbal-hair-mist");
  // therapi is the case the name fallback could never have covered: HWL's
  // spelling and Wynn's product name ("ThairaP") do not match.
  assert.equal(resolveCatalogSlug("therapi", catalog), "thairap-moisture-styling-cream");
});

test("key resolution is exact and one-to-one — it cannot invent a product", () => {
  // Slug, and product name, both resolve. Nothing else does.
  assert.equal(resolveCatalogSlug("revaivl-protein-conditioner", catalog), "revaivl-protein-conditioner");
  assert.equal(resolveCatalogSlug("revaivl", catalog), "revaivl-protein-conditioner");
  assert.equal(resolveCatalogSlug("REVAIVL", catalog), "revaivl-protein-conditioner");
  assert.equal(resolveCatalogSlug("Soft Life Bonnet", catalog), "soft-life-bonnet");

  // A NEED is not a product key. This is the retired lookup's whole vocabulary,
  // and none of it may resolve to anything.
  for (const need of [
    "cleanse_scalp",
    "reduce_surface_friction",
    "strength_protein_support",
    "protein",
    "strengthening treatment",
    "scalp comfort care",
    "shampoo",
    "conditioner",
    "oil",
  ]) {
    assert.equal(resolveCatalogSlug(need, catalog), null, `"${need}" must not resolve to a product`);
  }

  // No partial or fuzzy matching in either direction.
  assert.equal(resolveCatalogSlug("revaiv", catalog), null, "a prefix is not a key");
  assert.equal(resolveCatalogSlug("revaivl protein", catalog), null, "a near-miss is not a key");
  assert.equal(resolveCatalogSlug("", catalog), null);
  assert.equal(resolveCatalogSlug(null, catalog), null);
});

test("resolution never creates authorization — an unauthorized key still cannot render", () => {
  // "lathyr" resolves perfectly well as a catalog key. It is still not in
  // matches, so it still may not render.
  const ctx = context({
    matches: [{ productKey: "revaivl", productName: "Revaivl", matchClass: "strong", why: "Resolved." }],
  });
  assert.equal(resolveCatalogSlug("lathyr", catalog), "lathyr-shampoo", "resolvable…");
  assert.deepEqual(
    enforceMatchesOnly([{ productKey: "lathyr", catalogSlug: "lathyr-shampoo" }], ctx.matches),
    [],
    "…and still unauthorized",
  );
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

test("R3b. a qualifying product is named only when it is also an authorized match", () => {
  const guidance = selectGuidance({
    context: context({
      coverage: [
        // Lathyr is NOT authorized. Naming it here would show a shopper a
        // product CrownPrint did not choose, inside a section that tells them
        // it is not a recommendation.
        { functionKey: "cleanse_scalp", functionLabel: "Gentle cleansing", status: "covered", qualifyingProducts: ["Lathyr", "Revaivl"] },
        { functionKey: "seal_moisture", functionLabel: "Moisture sealing", status: "partial", qualifyingProducts: ["Nourish"] },
      ],
      matches: [{ productKey: "revaivl", productName: "Revaivl", matchClass: "strong", why: "Resolved." }],
    }),
    catalog,
  });

  const cleanse = guidance.coverage.find((c) => c.functionKey === "cleanse_scalp");
  assert.deepEqual(cleanse.qualifyingProducts, ["Revaivl"], "only the authorized name survives");
  assert.equal(cleanse.label, "Gentle cleansing", "the function is still described in full");

  const seal = guidance.coverage.find((c) => c.functionKey === "seal_moisture");
  assert.deepEqual(seal.qualifyingProducts, [], "an unauthorized name is stripped entirely");

  // Stripping a name never removes the coverage row itself.
  assert.equal(guidance.coverage.length, 2);
  // And it certainly does not create a card.
  assert.deepEqual(guidance.matches.map((m) => m.productKey), ["revaivl"]);
});

test("R3c. the qualifying-name filter is case- and whitespace-insensitive", () => {
  const guidance = selectGuidance({
    context: context({
      coverage: [{ functionKey: "strength", status: "covered", qualifyingProducts: ["  revaivl  ", "LATHYR"] }],
      matches: [{ productKey: "revaivl", productName: "Revaivl", matchClass: "strong", why: "Resolved." }],
    }),
    catalog,
  });
  // The boundary already trims every string it accepts, so what reaches here is
  // "revaivl" — matched case-insensitively against the authorized "Revaivl",
  // and printed in the Lab's own casing. "LATHYR" is stripped.
  assert.deepEqual(guidance.coverage[0].qualifyingProducts, ["revaivl"]);
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
//
// SCOPE. Every file on a CrownPrint product-rendering path, not just the two
// libs — a lookup table reintroduced in a page component would render products
// exactly as well as one in lib/, and would have slipped past a lib-only scan.
// ---------------------------------------------------------------------------
const RENDER_PATH_FILES = [
  "../lib/crownprint-fit.ts",
  "../lib/crownprint-guidance.ts",
  "../lib/crownprint-match-intelligence.ts",
  "../app/shop-by-crownprint/page.tsx",
  "../app/shop-by-crownprint/CrownPrintExperience.tsx",
  "../app/crownprint/page.tsx",
  "../app/crownprint/CrownPrintFinder.tsx",
];

/** Strip comments so a mention in prose never trips the scan — only live code counts. */
const liveCode = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

test("R6. no function/label/category-to-product lookup exists on any render path", async () => {
  const sources = new Map();
  for (const path of RENDER_PATH_FILES) {
    sources.set(path, liveCode(await readFile(new URL(path, import.meta.url), "utf8")));
  }

  // The retired machinery, by name.
  for (const gone of ["CATALOG_CAPABILITIES", "matchFunctionsToCatalog", "FunctionCoverage", "wynnFilled"]) {
    for (const [path, source] of sources) {
      assert.equal(
        new RegExp(`\\b${gone}\\b`).test(source),
        false,
        `${gone} is back as live code in ${path} — the retired fallback must not return`,
      );
    }
  }

  // Appending to matches after HWL's array is consumed IS the retired pattern,
  // whatever it is named this time.
  for (const [path, source] of sources) {
    assert.equal(
      /\bmatches\.push\(/.test(source),
      false,
      `${path} appends to matches — nothing may be added after HWL's array is consumed`,
    );
  }

  // And the guard must still be wired in at the render boundary. Deleting the
  // call is the quietest way to undo all of this, so it is asserted directly
  // rather than inferred from behavior.
  assert.match(
    sources.get("../app/shop-by-crownprint/page.tsx"),
    /enforceMatchesOnly\(/,
    "the fail-closed render guard has been removed from /shop-by-crownprint",
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
