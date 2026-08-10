// GOLDEN ACCEPTANCE MATRIX — CrownPrint product experience.
//
// One durable suite over representative payloads, asserting POSITIVE behaviour
// (the authorized thing renders, correctly explained) and NEGATIVE behaviour
// (nothing else can produce a product card, by any route).
//
// The negative half is the point. Every architectural prohibition in this
// integration was, at some stage, violated by code that looked reasonable:
// a regex table turned function labels into cards, a coverage row named a
// product nobody authorized, an accessory arrived through formulation
// keywords, and an authorized product vanished silently at a key mismatch. The
// tests below are the shape of those failures, frozen.
//
// Runs the REAL pipeline — normalizeMatchContext → selectGuidance →
// enforceMatchesOnly — and, for markup assertions, the real component.

import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { normalizeMatchContext } from "../lib/crownprint-state.mjs";
import { enforceMatchesOnly, selectGuidance } from "../lib/crownprint-guidance.ts";
import {
  HWL_CANONICAL_PRODUCT_KEYS,
  resolveCatalogSlug,
} from "../lib/crownprint-catalog-key.ts";
import { HWL_CANONICAL_CAPABILITY_KEYS, capabilityLabel } from "../lib/crownprint-capability-labels.ts";
import { auditRoutine } from "../lib/crownprint-audit.ts";
import { products } from "../app/data.ts";
import CrownPrintExperience from "../app/shop-by-crownprint/CrownPrintExperience.tsx";

const catalog = products;

/** A realistic HWL payload, through the real boundary. */
const payload = (over = {}) =>
  normalizeMatchContext({
    crownPrintPresent: true,
    entitlementActive: true,
    entitlementStatus: "active",
    assessmentComplete: true,
    resultsReady: true,
    crownPrintCode: "P2-D3-T3-S2-E2",
    crownState: { present: true, fresh: true, summary: "Loose natural, mid-wear, comfortable scalp" },
    currentPriorityLabel: "Strength & Protein Support",
    matches: [],
    ...over,
  });

const match = (productKey, matchClass, over = {}) => ({
  productKey,
  productName: productKey,
  matchClass,
  why: `Resolved ${matchClass} by the Lab.`,
  needServed: "Strength & Protein Support",
  functionServed: "Temporarily reinforce the fibre",
  functionKey: "reinforce_fibre",
  evidence: { ingredient: "Rice protein", capabilityKey: "proteins_peptides", statement: "Statement from the Lab." },
  limitation: "Addresses the named need only.",
  ...over,
});

/** The full page pipeline, exactly as app/shop-by-crownprint/page.tsx runs it. */
function renderPipeline(context) {
  const guidance = selectGuidance({ context, catalog });
  const cards = enforceMatchesOnly(guidance.matches, context ? context.matches : null)
    .filter((m) => catalog.some((p) => p.slug === m.catalogSlug));
  return { guidance, cards, keys: cards.map((c) => c.productKey) };
}

/** The real component's markup for a resolved context. */
function renderMarkup(context) {
  const { guidance, cards } = renderPipeline(context);
  const catalogCards = cards.map((m) => {
    const p = catalog.find((x) => x.slug === m.catalogSlug);
    return {
      slug: p.slug, name: p.name, subtitle: p.subtitle, price: p.price, image: null,
      url: `/products/${p.slug}`, simple: true, matchClass: m.matchClass, why: m.why,
      need: m.need, whenToUse: m.whenToUse, functionServed: m.functionServed,
      evidence: m.evidence, limitation: m.limitation,
      ...(p.methodStep > 0 ? { routineStep: p.methodStep, routineStage: p.category } : {}),
      rationale: m.rationale,
    };
  });
  return renderToStaticMarkup(
    createElement(CrownPrintExperience, {
      state: "MATCH_READY", showResults: true, recovery: false, source: guidance.source,
      sourceLabel: guidance.label, crownPrintCode: guidance.code, priorities: guidance.priorities,
      functions: guidance.functions, coverage: guidance.coverage, accessories: guidance.accessories,
      gaps: guidance.gaps, contextNotes: guidance.notes, noStrongMatch: guidance.noStrongMatch,
      unresolvedCount: Math.max(0, (context?.matches.length ?? 0) - catalogCards.length),
      routineStatus: guidance.routineStatus, routine: guidance.routine,
      hasStrong: catalogCards.some((c) => c.matchClass === "strong"), products: catalogCards,
      urls: { connect: "/c", create: "/cr", refresh: "/r", disconnect: "/d", productHub: null },
    }),
  );
}

const SNAKE_CASE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

// ===========================================================================
// A. MATCH-CLASS COMBINATIONS
// ===========================================================================

const CLASS_SCENARIOS = [
  { name: "zero authorized products", matches: [], expect: [] },
  { name: "one strong", matches: [match("revaivl", "strong")], expect: ["revaivl"] },
  { name: "multiple strong", matches: [match("revaivl", "strong"), match("reliefOil", "strong")], expect: ["revaivl", "reliefOil"] },
  { name: "good only", matches: [match("nourishOil", "good")], expect: ["nourishOil"] },
  { name: "conditional only", matches: [match("edgeControl", "conditional")], expect: ["edgeControl"] },
  {
    name: "mixed strong / good / conditional",
    matches: [match("revaivl", "strong"), match("nourishOil", "good"), match("edgeControl", "conditional")],
    expect: ["revaivl", "nourishOil", "edgeControl"],
  },
  {
    name: "multiple products supporting one function",
    matches: [
      match("revaivl", "strong", { functionKey: "reinforce_fibre" }),
      match("uplyft", "good", { functionKey: "reinforce_fibre" }),
    ],
    expect: ["revaivl", "uplyft"],
  },
];

for (const scenario of CLASS_SCENARIOS) {
  test(`A. ${scenario.name} — renders exactly the authorized set`, () => {
    const ctx = payload({ matches: scenario.matches });
    const { keys } = renderPipeline(ctx);
    assert.deepEqual([...keys].sort(), [...scenario.expect].sort());
    // Never a superset, at any class combination.
    const authorized = new Set(ctx.matches.map((m) => m.productKey));
    for (const k of keys) assert.ok(authorized.has(k), `${k} rendered without authorization`);
  });
}

test("A. more products never reads as a better CrownPrint result", () => {
  const one = renderMarkup(payload({ matches: [match("revaivl", "strong")] }));
  const many = renderMarkup(payload({
    matches: [match("revaivl", "strong"), match("nourishOil", "good"), match("edgeControl", "conditional")],
  }));

  // The single-match page frames itself as precise, not thin.
  assert.match(one, /One product earned a direct CrownPrint match/);
  // The multi-match page makes no comparative or completeness claim.
  for (const boast of [/more complete/i, /fuller routine/i, /better match/i, /\b3 matches\b/i]) {
    assert.equal(boast.test(many), false, `multi-match page implies superiority: ${boast}`);
  }
  // Both carry the same framing of what the page is.
  for (const html of [one, many]) {
    assert.match(html, /Only\s+products explicitly authorized by CrownPrint appear here/);
  }
});

test("A. multiple priorities and functions all render, none invents a product", () => {
  const ctx = payload({
    currentPriorities: [{ label: "Strength & Protein Support" }, { label: "Moisture balance" }],
    productFunctionsNeeded: [
      { label: "Temporarily reinforce the fibre" },
      { label: "Water-based daily moisture" },
      { label: "Direct scalp care" },
    ],
    matches: [match("revaivl", "strong")],
  });
  const { guidance, keys } = renderPipeline(ctx);
  assert.equal(guidance.priorities.length, 2);
  assert.equal(guidance.functions.length, 3);
  assert.deepEqual(keys, ["revaivl"], "three functions, one authorized product");
});

// ===========================================================================
// B. NEGATIVE SPACE — what may NEVER create a product card
// ===========================================================================

test("B. coverage cannot create a product card, in any status", () => {
  for (const status of ["covered", "partial", "not_carried"]) {
    const ctx = payload({
      coverage: [
        { functionKey: "cleanse_scalp", functionLabel: "Gentle cleansing", status, qualifyingProducts: ["Lathyr"] },
        { functionKey: "seal_moisture", functionLabel: "Moisture sealing", status, qualifyingProducts: ["Nourish"] },
      ],
      matches: [],
    });
    const { keys, guidance } = renderPipeline(ctx);
    assert.deepEqual(keys, [], `coverage with status "${status}" produced a card`);
    // And the qualifying names are stripped, since neither is authorized.
    for (const c of guidance.coverage) assert.deepEqual(c.qualifyingProducts, []);
  }
});

test("B. capabilities cannot create a product card", () => {
  for (const capabilityKey of HWL_CANONICAL_CAPABILITY_KEYS) {
    const ctx = payload({
      coverage: [{ functionKey: "any_function", status: "covered" }],
      matches: [],
      // A capability mentioned with no match behind it.
      evidence: { ingredient: "Rice protein", capabilityKey },
    });
    assert.deepEqual(renderPipeline(ctx).keys, [], `capability "${capabilityKey}" produced a card`);
  }
});

test("B. functions cannot create a product card", () => {
  const ctx = payload({
    productFunctionsNeeded: [
      { label: "Gentle cleansing" }, { label: "Sealing" }, { label: "Direct scalp care" },
      { label: "Protein or strengthening treatment" },
    ],
    matches: [],
  });
  const { keys, guidance } = renderPipeline(ctx);
  assert.deepEqual(keys, []);
  assert.equal(guidance.functions.length, 4, "the functions are still described");
});

test("B. accessories never enter matches", () => {
  const ctx = payload({
    accessories: [{ productKey: "softLifeBonnet", why: "Overnight friction." }, { productKey: "scrunchieSet" }],
    matches: [match("revaivl", "strong")],
  });
  const { keys, guidance } = renderPipeline(ctx);
  assert.deepEqual(keys, ["revaivl"], "accessories stay out of the authorized set");
  assert.deepEqual(guidance.accessories.map((a) => a.productKey), ["softLifeBonnet", "scrunchieSet"]);
});

test("B. a coverage function is never promoted into an accessory", () => {
  const ctx = payload({
    coverage: [{ functionKey: "reduce_surface_friction", status: "partial" }],
    accessories: [],
    matches: [match("revaivl", "strong")],
  });
  assert.deepEqual(renderPipeline(ctx).guidance.accessories, [], "coverage produced an accessory");
});

test("B. a not-carried gap is never filled with a nearby product", () => {
  const ctx = payload({
    notCarried: [{ label: "Heat protection" }, { label: "Chelation / mineral removal" }],
    coverage: [{ functionKey: "bond_repair", functionLabel: "Bond repair", status: "not_carried" }],
    matches: [],
  });
  const { keys, guidance } = renderPipeline(ctx);
  assert.deepEqual(keys, [], "a gap produced a product");
  assert.ok(guidance.gaps.length >= 3, "the gaps are reported honestly");
});

test("B. coverage naming a product absent from matches never yields a card or a name", () => {
  const ctx = payload({
    coverage: [{ functionKey: "cleanse_scalp", functionLabel: "Gentle cleansing", status: "covered", qualifyingProducts: ["Lathyr", "Uplyft"] }],
    matches: [match("revaivl", "strong")],
  });
  const { keys, guidance } = renderPipeline(ctx);
  assert.deepEqual(keys, ["revaivl"]);
  assert.deepEqual(guidance.coverage[0].qualifyingProducts, [], "unauthorized names stripped");

  const html = renderMarkup(ctx);
  assert.equal(/Lathyr|Uplyft/.test(html), false, "and never reach the markup");
});

// ===========================================================================
// C. IDENTITY RESOLUTION — never authorization
// ===========================================================================

test("C. every canonical product key resolves and renders when authorized", () => {
  for (const key of HWL_CANONICAL_PRODUCT_KEYS) {
    const ctx = payload({ matches: [match(key, "strong")] });
    const { keys, cards } = renderPipeline(ctx);
    assert.deepEqual(keys, [key], `${key} did not render when authorized`);
    assert.equal(cards[0].catalogSlug, resolveCatalogSlug(key, catalog));
  }
});

test("C. a resolvable key is still blocked when unauthorized", () => {
  const ctx = payload({ matches: [match("revaivl", "strong")] });
  for (const key of HWL_CANONICAL_PRODUCT_KEYS.filter((k) => k !== "revaivl")) {
    assert.ok(resolveCatalogSlug(key, catalog), `${key} resolves…`);
    assert.deepEqual(
      enforceMatchesOnly([{ productKey: key, catalogSlug: resolveCatalogSlug(key, catalog) }], ctx.matches),
      [],
      `…and ${key} must still be blocked`,
    );
  }
});

test("C. an unresolved authorized key does not silently disappear", () => {
  const ctx = payload({ matches: [match("a-key-we-cannot-resolve", "strong")] });
  const { keys } = renderPipeline(ctx);

  assert.deepEqual(keys, [], "it cannot render");
  // The audit's signal: authorized but not rendered.
  const unresolved = ctx.matches.map((m) => m.productKey).filter((k) => !keys.includes(k));
  assert.deepEqual(unresolved, ["a-key-we-cannot-resolve"]);

  // And the customer is told the truth: something WAS authorized.
  const html = renderMarkup(ctx);
  assert.match(html, /authorized a product, but we couldn.t display it here/i);
  assert.equal(
    /No direct Wynn Essentials product match was authorized/.test(html),
    false,
    "must not claim nothing was authorized — that is false",
  );
});

// ===========================================================================
// D. VOCABULARY — nothing raw reaches a customer
// ===========================================================================

test("D. every emittable capability key renders as a readable label", () => {
  for (const capabilityKey of HWL_CANONICAL_CAPABILITY_KEYS) {
    const ctx = payload({
      matches: [match("revaivl", "strong", { evidence: { ingredient: "Rice protein", capabilityKey } })],
    });
    const html = renderMarkup(ctx);
    assert.match(html, new RegExp(`Capability:</b> ${capabilityLabel(capabilityKey).replace(/&/g, "&amp;")}`));
    if (capabilityKey.includes("_")) assert.equal(new RegExp(capabilityKey).test(html), false);
  }
});

test("D. an unknown future capability key degrades readably and stays auditable", () => {
  const ctx = payload({
    matches: [match("revaivl", "strong", { evidence: { ingredient: "X", capabilityKey: "film_formers" } })],
  });
  const html = renderMarkup(ctx);
  assert.equal(/film_formers/.test(html), false, "never raw");
  assert.match(html, /Capability:<\/b> Film formers/, "defensive fallback");
});

test("D. no raw machine vocabulary leaks into customer markup, across the matrix", () => {
  const scenarios = [
    payload({ matches: [] }),
    payload({ matches: [match("revaivl", "strong")] }),
    payload({
      matches: [match("revaivl", "strong"), match("nourishOil", "good"), match("edgeControl", "conditional")],
      coverage: [
        { functionKey: "cleanse_scalp", functionLabel: "Gentle cleansing", status: "covered" },
        { functionKey: "reduce_surface_friction", status: "partial" },
        { functionKey: "heat_protection", functionLabel: "Heat protection", status: "not_carried" },
      ],
      accessories: [{ productKey: "softLifeBonnet", why: "Overnight friction." }],
      notCarried: [{ label: "Chelation" }],
    }),
    payload({ matches: [match("unresolvable_key", "strong")] }),
  ];
  for (const [i, ctx] of scenarios.entries()) {
    const leaks = [...new Set(renderMarkup(ctx).match(SNAKE_CASE) ?? [])];
    assert.deepEqual(leaks, [], `scenario ${i} leaked: ${leaks.join(", ")}`);
  }
});

// ===========================================================================
// E. SPARSE STATES
// ===========================================================================

test("E. coverage without any authorized match still communicates CrownPrint intelligence", () => {
  const ctx = payload({
    coverage: [
      { functionKey: "cleanse_scalp", functionLabel: "Gentle cleansing", status: "covered" },
      { functionKey: "seal_moisture", functionLabel: "Moisture sealing", status: "partial" },
      { functionKey: "heat_protection", functionLabel: "Heat protection", status: "not_carried" },
    ],
    matches: [],
  });
  const html = renderMarkup(ctx);

  assert.match(html, /No direct Wynn Essentials product match was authorized/);
  assert.match(html, /Your other CrownPrint needs/, "the coverage still explains itself");
  assert.match(html, /Wynn Essentials can cover/);
  assert.match(html, /does not currently carry/);
  // No catalog fallback of any kind.
  assert.equal(/Add to Cart/.test(html), false, "zero matches must never surface a product");
});

test("E. accessory-only support renders without implying a formulation match", () => {
  const ctx = payload({
    accessories: [{ productKey: "softLifeBonnet", why: "Supports reduced overnight friction against bedding." }],
    matches: [],
  });
  const html = renderMarkup(ctx);

  assert.match(html, /Routine support/i);
  assert.match(html, /Soft Life Bonnet/);
  assert.match(html, /not<\/b> CrownPrint formulation matches/);
  assert.match(html, /No direct Wynn Essentials product match was authorized/, "and the match state is still honest");
  assert.equal(/cp-badge-strong/.test(html), false, "an accessory carries no match class");
});

test("E. conditional-only does not read as an error or a downgrade", () => {
  const html = renderMarkup(payload({ matches: [match("edgeControl", "conditional")] }));
  assert.match(html, /Conditional/i);
  for (const scary of [/went wrong/i, /error/i, /unfortunately/i, /sorry/i]) {
    assert.equal(scary.test(html), false, `conditional-only reads as failure: ${scary}`);
  }
});

// ===========================================================================
// F. ROUTINE PLACEMENT — organizes, never authorizes
// ===========================================================================

test("F. routine placement labels an authorized card and creates none", () => {
  const html = renderMarkup(payload({ matches: [match("revaivl", "strong")] }));
  // Revaivl is step 3 / Treat in Wynn's own catalog.
  assert.match(html, /THE WYNN METHOD · STEP 3 · TREAT/);

  // The other five routine stages are NOT rendered as products.
  for (const name of ["Lathyr", "Uplyft", "Hydrate", "Nourish", "ThairaP"]) {
    assert.equal(new RegExp(`>${name}<`).test(html), false, `${name} appeared from routine placement`);
  }
});

test("F. routine stage never changes which products render", () => {
  for (const key of ["lathyr", "uplyft", "revaivl", "hydrateMist", "nourishOil", "therapi"]) {
    const { keys } = renderPipeline(payload({ matches: [match(key, "strong")] }));
    assert.deepEqual(keys, [key], "routine grouping altered the authorized set");
  }
});

// ===========================================================================
// G. ROUTINE — a separate authority from matches
// ===========================================================================

const routineStep = (order, productKey, over = {}) => ({
  order, productKey,
  slot: `Stage ${order}`,
  routineRole: `Role ${order}`,
  whenToUse: `When ${order}`,
  frequency: `Frequency ${order}`,
  why: `Why ${order}`,
  ...over,
});

test("G. not_built never produces routine steps", () => {
  const ctx = payload({
    routineStatus: "not_built",
    // A routine array sent alongside not_built must be ignored entirely.
    routine: [routineStep(1, "lathyr"), routineStep(2, "revaivl")],
    matches: [match("revaivl", "strong")],
  });
  const { guidance } = renderPipeline(ctx);
  assert.equal(guidance.routineStatus, "not_built");
  assert.deepEqual(guidance.routine, [], "not_built must yield no steps");

  const html = renderMarkup(ctx);
  assert.match(html, /Build your personalized routine/);
  assert.match(html, /Complete the routine builder to organize compatible products into an ordered regimen/);
  assert.equal(/Your CrownPrint routine/.test(html), false, "no built-routine heading");
  // And the direct matches stay visible independently.
  assert.match(html, /Revaivl/);
  assert.match(html, /Your Wynn Essentials matches/);
});

test("G. a built routine renders in HWL order, never Wynn's", () => {
  // Deliberately supplied out of order, and in an order that neither match
  // class nor Wynn Method step would reproduce.
  const ctx = payload({
    routineStatus: "built",
    routine: [routineStep(3, "lathyr"), routineStep(1, "nourishOil"), routineStep(2, "revaivl")],
    matches: [match("revaivl", "conditional"), match("lathyr", "strong")],
  });
  const { guidance } = renderPipeline(ctx);

  assert.deepEqual(guidance.routine.map((r) => r.productKey), ["nourishOil", "revaivl", "lathyr"]);
  assert.deepEqual(guidance.routine.map((r) => r.order), [1, 2, 3]);

  // Wynn Method order would be lathyr(1) → revaivl(3) → nourishOil(5).
  // Match-class order would be lathyr(strong) → revaivl(conditional).
  // Neither is what rendered.
  assert.notDeepEqual(guidance.routine.map((r) => r.productKey), ["lathyr", "revaivl", "nourishOil"]);

  // Scoped to the routine section: these product names also appear in the match
  // cards above, so a whole-page index would measure the wrong thing.
  const html = renderMarkup(ctx);
  const start = html.indexOf('class="cp-routine-steps"');
  const routineHtml = html.slice(start, html.indexOf("</ol>", start));
  assert.ok(start > 0, "the routine section rendered");
  const seq = ["Nourish", "Revaivl", "Lathyr"].map((n) => routineHtml.indexOf(`>${n}<`));
  assert.ok(seq.every((i) => i >= 0), "all three steps rendered");
  assert.ok(seq[0] < seq[1] && seq[1] < seq[2], `rendered order was not HWL's: ${JSON.stringify(seq)}`);
  for (const field of ["Role:", "When:", "How often:"]) assert.ok(html.includes(field), `${field} renders`);
  assert.match(html, /Stage 1/);
});

test("G. routine order never changes match rank", () => {
  const matches = [match("revaivl", "strong"), match("lathyr", "good"), match("nourishOil", "conditional")];
  const withoutRoutine = renderPipeline(payload({ matches })).keys;
  const withRoutine = renderPipeline(payload({
    matches,
    routineStatus: "built",
    // The exact reverse of the match order.
    routine: [routineStep(1, "nourishOil"), routineStep(2, "lathyr"), routineStep(3, "revaivl")],
  })).keys;

  assert.deepEqual(withRoutine, withoutRoutine, "the routine re-ordered the matches");
});

test("G. match rank never changes routine order", () => {
  const routine = [routineStep(1, "nourishOil"), routineStep(2, "lathyr"), routineStep(3, "revaivl")];
  const asSent = ["nourishOil", "lathyr", "revaivl"];

  for (const classes of [["strong", "good", "conditional"], ["conditional", "conditional", "strong"]]) {
    const ctx = payload({
      routineStatus: "built",
      routine,
      matches: [match("revaivl", classes[0]), match("lathyr", classes[1]), match("nourishOil", classes[2])],
    });
    assert.deepEqual(
      renderPipeline(ctx).guidance.routine.map((r) => r.productKey),
      asSent,
      `match classes ${classes.join("/")} altered routine order`,
    );
  }
});

test("G. a product may be in matches without being in the routine, and vice versa", () => {
  const ctx = payload({
    routineStatus: "built",
    routine: [routineStep(1, "lathyr")],            // not a match
    matches: [match("revaivl", "strong")],          // not in the routine
  });
  const { guidance, keys } = renderPipeline(ctx);

  assert.deepEqual(keys, ["revaivl"], "the match renders");
  assert.deepEqual(guidance.routine.map((r) => r.productKey), ["lathyr"], "the routine step renders");
  // The routine step did NOT become an authorized match.
  assert.equal(keys.includes("lathyr"), false, "a routine step is not a product card");
});

test("G. a routine accessory never becomes a formulation match", () => {
  const ctx = payload({
    routineStatus: "built",
    routine: [routineStep(1, "softLifeBonnet", { isAccessory: true }), routineStep(2, "revaivl")],
    matches: [match("revaivl", "strong")],
  });
  const { guidance, keys } = renderPipeline(ctx);

  assert.deepEqual(keys, ["revaivl"], "the bonnet is not an authorized match");
  const bonnet = guidance.routine.find((r) => r.productKey === "softLifeBonnet");
  assert.ok(bonnet, "it is a routine step");
  assert.equal(bonnet.isAccessory, true);
  assert.equal("matchClass" in bonnet, false, "a routine step carries no match class");
  assert.equal("evidence" in bonnet, false, "and no formulation evidence");
});

test("G. a routine step carries no match class or evidence, even if HWL sends them", () => {
  const ctx = payload({
    routineStatus: "built",
    routine: [{ order: 1, productKey: "revaivl", matchClass: "strong", evidence: { ingredient: "Rice protein" } }],
    matches: [],
  });
  const step = renderPipeline(ctx).guidance.routine[0];
  assert.equal("matchClass" in step, false);
  assert.equal("evidence" in step, false);
});

test("G. an unavailable routine fails transparently and generates nothing", () => {
  for (const status of ["unavailable", "error", "something_unrecognized"]) {
    const ctx = payload({
      routineStatus: status,
      routine: [routineStep(1, "lathyr")],
      matches: [match("revaivl", "strong")],
    });
    const { guidance, keys } = renderPipeline(ctx);
    assert.equal(guidance.routineStatus, "unavailable", `"${status}" must resolve to unavailable`);
    assert.deepEqual(guidance.routine, [], "no steps from an unavailable routine");
    assert.deepEqual(keys, ["revaivl"], "matches are unaffected");

    const html = renderMarkup(ctx);
    assert.match(html, /couldn.t load your routine/i);
    assert.equal(/Build your personalized routine/.test(html), false, "not the not_built CTA");
    // No catalog-generated sequencing anywhere.
    assert.equal(/cp-routine-steps/.test(html), false);
  }
});

test("G. no routineStatus at all renders no routine section", () => {
  const html = renderMarkup(payload({ matches: [match("revaivl", "strong")] }));
  assert.equal(/Your CrownPrint routine/.test(html), false);
  assert.equal(/Build your personalized routine/.test(html), false);
});

// ===========================================================================
// H. ROUTINE AUDIT — observational only
//
// The audit's job is to SAY when the pipeline is wrong, never to correct it. So
// each check is tested in both directions: it passes on a healthy pipeline, and
// it FAILS when handed the shape of the corresponding defect. A verifier that
// only ever returns true has verified nothing.
// ===========================================================================

const auditFor = (ctx) => {
  const { guidance, keys } = renderPipeline(ctx);
  return auditRoutine({
    routineStatus: guidance.routineStatus,
    sent: ctx.routine ?? [],
    rendered: guidance.routine,
    renderedMatchKeys: keys,
    authorizedKeys: ctx.matches.map((m) => m.productKey),
    catalog,
  });
};

test("H. built — reports every routine field and passes every check", () => {
  const ctx = payload({
    routineStatus: "built",
    routine: [routineStep(1, "lathyr"), routineStep(2, "revaivl"), routineStep(3, "nourishOil")],
    matches: [match("revaivl", "strong")],
  });
  const a = auditFor(ctx);

  assert.equal(a.routineStatus, "built");
  assert.equal(a.routineStepCount, 3);
  assert.deepEqual(a.routineProductKeys, ["lathyr", "revaivl", "nourishOil"]);
  assert.deepEqual(a.routineCatalogSlugs, ["lathyr-shampoo", "revaivl-protein-conditioner", "nourish-oil"]);
  assert.deepEqual(a.routineOrders, [1, 2, 3]);
  assert.deepEqual(a.routineUnresolvedKeys, []);
  assert.equal(a.ctaActive, false);

  assert.deepEqual(a.checks, {
    ordersPreserved: true,
    allResolveThroughBridge: true,
    noStepFromCoverage: true,
    matchesUnaltered: true,
  });
});

test("H. built — ordering is reported as preserved when HWL's sequence is unusual", () => {
  // An order neither match class nor Wynn Method would produce.
  const ctx = payload({
    routineStatus: "built",
    routine: [routineStep(1, "nourishOil"), routineStep(2, "revaivl"), routineStep(3, "lathyr")],
    matches: [match("lathyr", "strong"), match("revaivl", "conditional")],
  });
  const a = auditFor(ctx);
  assert.deepEqual(a.routineProductKeys, ["nourishOil", "revaivl", "lathyr"]);
  assert.equal(a.checks.ordersPreserved, true);
  assert.equal(a.checks.matchesUnaltered, true, "the routine did not add nourishOil to the cards");
});

test("H. not_built — zero steps, CTA state exposed, no checks", () => {
  const ctx = payload({
    routineStatus: "not_built",
    routine: [routineStep(1, "lathyr")],
    matches: [match("revaivl", "strong")],
  });
  const a = auditFor(ctx);

  assert.equal(a.routineStatus, "not_built");
  assert.equal(a.routineStepCount, 0, "not_built must render no steps");
  assert.deepEqual(a.routineProductKeys, []);
  assert.deepEqual(a.routineOrders, []);
  assert.equal(a.ctaActive, true, "the builder CTA is on screen");
  assert.equal(a.checks, null, "there is nothing to check without a built routine");
});

for (const status of ["unavailable", "error", "something_unrecognized"]) {
  test(`H. ${status} — no routine steps render`, () => {
    const ctx = payload({
      routineStatus: status,
      routine: [routineStep(1, "lathyr"), routineStep(2, "revaivl")],
      matches: [match("revaivl", "strong")],
    });
    const a = auditFor(ctx);
    assert.equal(a.routineStatus, "unavailable");
    assert.equal(a.routineStepCount, 0);
    assert.equal(a.ctaActive, false, "unavailable is not the CTA state");
    assert.equal(a.checks, null);
  });
}

test("H. unresolved routine identity is reported, not absorbed", () => {
  const ctx = payload({
    routineStatus: "built",
    routine: [routineStep(1, "lathyr"), routineStep(2, "a-key-we-cannot-resolve"), routineStep(3, "revaivl")],
    matches: [match("revaivl", "strong")],
  });
  const a = auditFor(ctx);

  assert.deepEqual(a.routineUnresolvedKeys, ["a-key-we-cannot-resolve"]);
  assert.equal(a.routineStepCount, 2, "the unresolvable step is not rendered");
  // And the audit SAYS the sequence no longer matches what HWL sent, rather
  // than quietly reporting the surviving two steps as healthy.
  assert.equal(a.checks.ordersPreserved, false, "a dropped step is an order failure, not a rounding error");
});

// --- the checks must be able to fail -------------------------------------

test("H. ordersPreserved fails on a re-sorted routine", () => {
  const sent = [{ order: 1, productKey: "nourishOil" }, { order: 2, productKey: "revaivl" }];
  const resorted = [
    { order: 2, productKey: "revaivl", catalogSlug: "revaivl-protein-conditioner", productName: "Revaivl", isAccessory: false },
    { order: 1, productKey: "nourishOil", catalogSlug: "nourish-oil", productName: "Nourish", isAccessory: false },
  ];
  const a = auditRoutine({
    routineStatus: "built", sent, rendered: resorted,
    renderedMatchKeys: [], authorizedKeys: [], catalog,
  });
  assert.equal(a.checks.ordersPreserved, false);
});

test("H. ordersPreserved fails on duplicate order values", () => {
  const sent = [{ order: 1, productKey: "lathyr" }, { order: 1, productKey: "revaivl" }];
  const rendered = [
    { order: 1, productKey: "lathyr", catalogSlug: "lathyr-shampoo", productName: "Lathyr", isAccessory: false },
    { order: 1, productKey: "revaivl", catalogSlug: "revaivl-protein-conditioner", productName: "Revaivl", isAccessory: false },
  ];
  const a = auditRoutine({ routineStatus: "built", sent, rendered, renderedMatchKeys: [], authorizedKeys: [], catalog });
  assert.equal(a.checks.ordersPreserved, false, "equal orders are not strictly ascending");
});

test("H. allResolveThroughBridge fails on a slug the bridge did not produce", () => {
  const a = auditRoutine({
    routineStatus: "built",
    sent: [{ order: 1, productKey: "revaivl" }],
    rendered: [{ order: 1, productKey: "revaivl", catalogSlug: "lathyr-shampoo", productName: "Lathyr", isAccessory: false }],
    renderedMatchKeys: [], authorizedKeys: [], catalog,
  });
  assert.equal(a.checks.allResolveThroughBridge, false);
});

test("H. noStepFromCoverage fails on a step HWL never sent", () => {
  const a = auditRoutine({
    routineStatus: "built",
    sent: [{ order: 1, productKey: "revaivl" }],
    rendered: [
      { order: 1, productKey: "revaivl", catalogSlug: "revaivl-protein-conditioner", productName: "Revaivl", isAccessory: false },
      { order: 2, productKey: "lathyr", catalogSlug: "lathyr-shampoo", productName: "Lathyr", isAccessory: false },
    ],
    renderedMatchKeys: [], authorizedKeys: [], catalog,
  });
  assert.equal(a.checks.noStepFromCoverage, false, "a manufactured step must be reported");
});

test("H. matchesUnaltered fails when a routine-only product reaches the cards", () => {
  const a = auditRoutine({
    routineStatus: "built",
    sent: [{ order: 1, productKey: "lathyr" }],
    rendered: [{ order: 1, productKey: "lathyr", catalogSlug: "lathyr-shampoo", productName: "Lathyr", isAccessory: false }],
    // lathyr is in the routine and NOT authorized, yet appears as a card.
    renderedMatchKeys: ["lathyr"],
    authorizedKeys: ["revaivl"],
    catalog,
  });
  assert.equal(a.checks.matchesUnaltered, false);
});

test("H. the audit never repairs what it finds", () => {
  const sent = [{ order: 5, productKey: "revaivl" }, { order: 1, productKey: "lathyr" }];
  const rendered = [
    { order: 5, productKey: "revaivl", catalogSlug: "revaivl-protein-conditioner", productName: "Revaivl", isAccessory: false },
    { order: 1, productKey: "lathyr", catalogSlug: "lathyr-shampoo", productName: "Lathyr", isAccessory: false },
  ];
  const a = auditRoutine({ routineStatus: "built", sent, rendered, renderedMatchKeys: [], authorizedKeys: [], catalog });

  // Reported exactly as observed — not sorted, not corrected.
  assert.deepEqual(a.routineOrders, [5, 1]);
  assert.deepEqual(a.routineProductKeys, ["revaivl", "lathyr"]);
  assert.equal(a.checks.ordersPreserved, false, "and the defect is reported");
});
