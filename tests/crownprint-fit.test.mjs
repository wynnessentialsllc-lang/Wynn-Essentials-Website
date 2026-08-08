import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCrownState, parseCrownPrintCode } from "../lib/crownprint-code.ts";
import { catalogGaps, currentPriorities, matchProducts, productFunctions, productUsage, whatToLookFor } from "../lib/crownprint-fit.ts";
import { products } from "../app/data.ts";

// ---------------------------------------------------------------------------
// Wynn's catalog-fit engine.
//
// These run against the real catalog (app/data.ts), so a product added, renamed,
// or retired is exercised here rather than discovered by a shopper. The
// reference profile is the real CrownPrint Intelligence Report™ fixture:
// P2-D3-T3-S2-E2, in braids, nearing takedown, tender scalp, dryness.
// ---------------------------------------------------------------------------

const profile = (code, state = {}) => ({
  core: parseCrownPrintCode(code).core,
  state: normalizeCrownState(state),
});

const REPORT = profile("P2-D3-T3-S2-E2", {
  style: "braids",
  stage: "takedown-soon",
  scalp: "tender",
  concern: "dryness",
  goal: "maintenance",
});

const fit = (p) => matchProducts(p, products);
const bySlug = (result, slug) => result.matches.find((m) => m.productKey === slug);

test("1. the report fixture resolves to a routine that answers its own priorities", () => {
  const result = fit(REPORT);

  // Priority #1 on the report is scalp comfort — a tender scalp outranks dryness.
  assert.equal(result.priorities[0].label, "Scalp comfort");
  assert.match(result.priorityLabel, /^Scalp comfort/);

  // The scalp answer and the moisture answers are the strong ones.
  assert.equal(bySlug(result, "relief-oil").matchClass, "strong", "a tender scalp in braids is what Relief is for");
  assert.equal(bySlug(result, "hydrate-herbal-hair-mist").matchClass, "strong", "a mist is what reaches hair inside braids");
  assert.equal(bySlug(result, "uplyft-conditioner").matchClass, "strong", "dryness on coarse strands needs the deep conditioner");

  assert.equal(result.noFit, false);
  assert.equal(result.noStrongMatch, false);
});

test("2. \"strong\" stays meaningful — the whole catalog is never strong", () => {
  const strong = fit(REPORT).matches.filter((m) => m.matchClass === "strong");
  assert.ok(strong.length >= 2, "a well-specified CrownPrint should reach a few strong matches");
  assert.ok(strong.length <= 4, `padding check: ${strong.length} strong matches is too many to be credible`);
});

test("3. no match is forced — a CrownPrint the catalog can't serve says so", () => {
  // A balanced scalp type on its own points at nothing we sell. The honest
  // answer is zero products plus guidance, not a default routine.
  const result = fit(profile("S2"));
  assert.equal(result.matches.length, 0);
  assert.equal(result.noFit, true);
  assert.ok(result.whatToLookFor.hairNeed.length > 40, "a no-fit result must still explain what to look for");
  assert.ok(result.whatToLookFor.ingredientFunctions.length > 0);
  assert.ok(result.whatToLookFor.whatMayNotFit.length > 0);
});

test("4. every rendered match carries why / need / when — no empty cards", () => {
  for (const p of [REPORT, profile("P3-D1-T1-S1-E1", { concern: "breakage" }), profile("P1-D3-T3-S3-E3", { concern: "buildup" })]) {
    for (const m of fit(p).matches) {
      assert.ok(m.why.length > 20, `${m.productKey} needs a real reason`);
      assert.ok(m.need.length > 3, `${m.productKey} needs a stated CrownPrint need`);
      assert.ok(m.whenToUse.length > 20, `${m.productKey} needs usage guidance`);
      assert.ok(m.keyIngredients.length > 0 || m.productKey.includes("bonnet") || m.productKey.includes("scrunchie") || m.productKey.includes("bundle"));
    }
  }
});

test("5. results are ordered strong → good → conditional, deterministically", () => {
  const rank = { strong: 0, good: 1, conditional: 2 };
  const a = fit(REPORT).matches.map((m) => m.productKey);
  const b = fit(REPORT).matches.map((m) => m.productKey);
  assert.deepEqual(a, b, "the same profile must always produce the same order");
  const classes = fit(REPORT).matches.map((m) => rank[m.matchClass]);
  assert.deepEqual(classes, [...classes].sort((x, y) => x - y));
});

test("6. low elasticity is the protein signal; high elasticity is a caveat", () => {
  const weak = bySlug(fit(profile("P3-E1", { concern: "breakage", goal: "repair" })), "revaivl-protein-conditioner");
  assert.equal(weak.matchClass, "strong");
  assert.match(weak.why, /elasticity|breakage/i);

  const springy = bySlug(fit(profile("P2-E3", { concern: "dryness" })), "revaivl-protein-conditioner");
  if (springy) {
    assert.notEqual(springy.matchClass, "strong", "hair that doesn't need protein must not be sold protein");
    assert.match(springy.caution ?? "", /occasional|month/i);
  }
});

test("7. caveats are attached where a product could genuinely be wrong", () => {
  // Fine, low-porosity strands and a heavy sealing oil.
  const nourish = bySlug(fit(profile("P1-T1", { concern: "dryness" })), "nourish-oil");
  assert.match(nourish.caution ?? "", /limp|drops/i);

  // A styling cream while the shopper is in braids.
  const thairap = bySlug(fit(profile("P2-T3", { style: "braids", concern: "definition" })), "thairap-moisture-styling-cream");
  assert.match(thairap.caution ?? "", /protective style/i);

  // Edge control against a hairline that is already under tension.
  const edges = bySlug(fit(profile("P2-D1-T1", { style: "braids", concern: "breakage" })), "edge-control");
  assert.match(edges.caution ?? "", /tension|light/i);
});

test("8. usage cadence adapts where the default would be wrong", () => {
  const oily = bySlug(fit(profile("P2-S3", { scalp: "oily", concern: "buildup" })), "lathyr-shampoo");
  assert.match(oily.whenToUse, /5–7 days/, "an oily scalp washes more often than the default");

  const takedown = bySlug(fit(profile("P2-T3", { stage: "post-takedown" })), "lathyr-shampoo");
  assert.match(takedown.whenToUse, /takedown/i);

  // The profile-independent lookup used by the HWL-connected page still works.
  assert.match(productUsage("lathyr-shampoo").whenToUse, /7–10 days/);
  assert.equal(productUsage("not-a-product"), null);
});

test("9. braiding hair is never recommended as a CrownPrint match", () => {
  const hairSlugs = products.filter((p) => p.kind === "hair").map((p) => p.slug);
  assert.ok(hairSlugs.length > 0, "the catalog should still contain braiding hair");
  for (const p of [REPORT, profile("P3-D3-T3-S1-E1", { style: "braids", concern: "dryness" })]) {
    for (const slug of hairSlugs) assert.equal(bySlug(fit(p), slug), undefined, `${slug} is an install material, not a fit decision`);
  }
});

test("10. the bundle only appears when the CrownPrint points at its steps", () => {
  const many = fit(profile("P3-D3-T3-S1-E1", { style: "natural", concern: "dryness", stage: "post-takedown" }));
  assert.ok(bySlug(many, "hair-wellness-bundle"), "a full-routine CrownPrint should surface the four-step system");

  const narrow = fit(profile("P2", { concern: "definition" }));
  assert.equal(bySlug(narrow, "hair-wellness-bundle"), undefined, "a single-need CrownPrint must not be upsold the bundle");
});

test("11. catalog gaps are named honestly, and only when the profile needs them", () => {
  const pressed = catalogGaps(profile("P2-T3", { style: "silkpress" }));
  assert.ok(pressed.some((g) => /heat protectant/i.test(g.label)), "we don't make one, so we have to say so");

  const buildup = catalogGaps(profile("P1", { concern: "buildup" }));
  assert.ok(buildup.some((g) => /clarifying|chelating/i.test(g.label)), "Lathyr is gentle by design — that's a gap for buildup");

  const flaking = catalogGaps(profile("P2-S1", { scalp: "flaky", concern: "scalp" }));
  assert.ok(flaking.some((g) => /medicated|dandruff/i.test(g.label)));

  // Not a wish list: a profile that needs none of it gets none of it.
  assert.deepEqual(catalogGaps(profile("P2-D2-T2-S2-E2")), []);
});

test("12. priorities and functions are populated for any usable profile", () => {
  const p = profile("P3-D1-T1-S4-E1", { style: "wig", scalp: "itchy", concern: "shedding", goal: "growth" });
  const priorities = currentPriorities(p);
  assert.equal(priorities[0].label, "Scalp comfort", "an itchy, sensitive scalp comes first");
  assert.ok(priorities.length <= 4, "a priority list longer than four is not a priority list");
  for (const item of priorities) assert.ok(item.detail.length > 30);

  const functions = productFunctions(p);
  assert.ok(functions.some((f) => /scalp care/i.test(f.label)));
  assert.ok(functions.some((f) => /low-tension/i.test(f.label)));
});

test("13. guidance is brand-agnostic and tailored to the axes given", () => {
  const guidance = whatToLookFor(profile("P1-T1", { concern: "dryness" }));
  assert.match(guidance.whyThisMatters, /brand-agnostic/i);
  assert.match(guidance.whyThisMatters, /low porosity/i, "the guidance must name the axes it is reasoning from");
  assert.ok(guidance.formulationCharacteristics.some((x) => /lightweight|water-first/i.test(x)));
  assert.ok(guidance.whatMayNotFit.some((x) => /heavy|butters/i.test(x)));

  // The opposite Core gets the opposite advice — this is not boilerplate.
  const opposite = whatToLookFor(profile("P3-T3", { concern: "dryness" }));
  assert.ok(opposite.formulationCharacteristics.some((x) => /occlusive|butter|seal/i.test(x)));
});

test("14. scalp discomfort always carries the see-a-professional note", () => {
  const result = fit(profile("P2-S4", { scalp: "tender", concern: "scalp" }));
  assert.ok(
    result.notes.some((n) => /licensed healthcare professional|dermatologist/i.test(n)),
    "persistent scalp discomfort is outside what product-fit guidance can evaluate",
  );
});

test("15. every match resolves to a real catalog product", () => {
  const slugs = new Set(products.map((p) => p.slug));
  for (const m of fit(REPORT).matches) {
    assert.ok(slugs.has(m.productKey), `${m.productKey} is not in the catalog`);
    assert.equal(m.productName, products.find((p) => p.slug === m.productKey).name);
  }
});
