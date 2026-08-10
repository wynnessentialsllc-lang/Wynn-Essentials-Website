// CUSTOMER COMPREHENSION — can a shopper tell these five things apart?
//
//   1. a matched product      (CrownPrint authorized it)
//   2. a function Wynn can cover
//   3. a function Wynn partially supports
//   4. a function Wynn does not carry
//   5. an accessory           (mechanical support, separate channel)
//
// The bug this guards against is not a wrong recommendation — the authorization
// tests cover that — it is a shopper MISREADING a correct page. A function
// listed as coverable must not look like a product that was chosen for them, and
// an accessory must not look like a formulation match. Those are presentation
// failures with the same consequence as an authorization failure: money spent on
// something CrownPrint never selected.
//
// These render the real component to HTML with react-dom/server, so they assert
// what a shopper actually receives rather than what the props said.

import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import CrownPrintExperience from "../app/shop-by-crownprint/CrownPrintExperience.tsx";
import {
  CAPABILITIES_NOT_EMITTABLE,
  CAPABILITY_LABELS,
  HWL_CANONICAL_CAPABILITY_KEYS,
  capabilityLabel,
  hasCapabilityLabel,
  mechanicalFallbackLabel,
} from "../lib/crownprint-capability-labels.ts";

const URLS = { connect: "/c", create: "/cr", refresh: "/r", disconnect: "/d", productHub: null };

const REVAIVL = {
  slug: "revaivl-protein-conditioner",
  name: "Revaivl",
  subtitle: "Protein-Rich Conditioner",
  price: 24.99,
  image: null,
  url: "/products/revaivl-protein-conditioner",
  simple: true,
  matchClass: "strong",
  why: "Resolved by the Lab: protein support for low elasticity.",
  need: "Strength & Protein Support",
  functionServed: "Temporarily reinforce the fibre",
  evidence: {
    ingredient: "Rice protein",
    capabilityKey: "proteins_peptides",
    statement: "Rice protein provides the protein/peptide capability CrownPrint requires for this function.",
  },
  limitation:
    "This recommendation addresses temporary fibre reinforcement. It does not replace other moisture, cleansing, scalp, heat-protection, or styling needs in your CrownPrint.",
  whenToUse: "Once or twice a month on clean, damp hair.",
  rationale: {
    heading: "WHY THIS IS A STRONG MATCH FOR YOU",
    signals: ["Strength & Protein Support", "Your current CrownState"],
    explanation: "Resolved strong by the Hair Wellness Lab.",
  },
};

const COVERAGE = [
  { functionKey: "cleanse_scalp", status: "covered", label: "Gentle cleansing", detail: "This establishes cleansing capability, not chelation.", qualifyingProducts: [] },
  { functionKey: "seal_moisture", status: "partial", label: "Moisture sealing", detail: "Supports slowing water loss; it does not deliver water into the fibre.", qualifyingProducts: [] },
  { functionKey: "heat_protection", status: "not_carried", label: "Heat protection", detail: "We don't make this.", qualifyingProducts: [] },
];

const ACCESSORY = {
  productKey: "softLifeBonnet",
  catalogSlug: "soft-life-bonnet",
  productName: "Soft Life Bonnet",
  why: "Supports reduced overnight friction against bedding.",
};

const render = (over = {}) =>
  renderToStaticMarkup(
    createElement(CrownPrintExperience, {
      state: "MATCH_READY",
      showResults: true,
      recovery: false,
      source: "crownprint-360",
      sourceLabel: "CrownPrint 360 — resolved by the Hair Wellness Lab",
      crownPrintCode: "P2-D3-T3-S2-E2",
      priorities: [{ label: "Strength & Protein Support", detail: "" }],
      functions: [],
      coverage: [],
      accessories: [],
      gaps: [],
      contextNotes: [],
      noStrongMatch: false,
      unresolvedCount: 0,
      hasStrong: true,
      products: [REVAIVL],
      urls: URLS,
      ...over,
    }),
  );

/**
 * The markup of ONE section, so an assertion cannot be satisfied by a different
 * part of the page. The class is matched with its closing quote and the
 * terminators are siblings rather than descendants, so a nested element (say
 * `cp-otherneeds-heading`) can never end the slice early.
 */
function section(html, exactClass, endClasses) {
  const start = html.indexOf(`class="${exactClass}"`);
  if (start === -1) return "";
  const rest = html.slice(start);
  const ends = endClasses.map((c) => rest.indexOf(`class="${c}`)).filter((i) => i > 0);
  return ends.length ? rest.slice(0, Math.min(...ends)) : rest;
}

// ---------------------------------------------------------------------------
// 1. A matched product is unmistakably a product.
// ---------------------------------------------------------------------------
test("a matched product renders as a product card with class, need, function, evidence and boundary", () => {
  const html = render();

  assert.match(html, /Revaivl/, "the product name renders");
  assert.match(html, /Strong Match/i, "the match class renders");
  assert.match(html, /Supports:<\/b> Strength &amp; Protein Support/, "the CrownPrint need renders");
  assert.match(html, /CrownPrint function:<\/b> Temporarily reinforce the fibre/, "the function renders");
  // Contract #642: the structured pair is the canonical explanation source,
  // rendered as two labelled facts — the ingredient verbatim, the capability
  // through Wynn's display map.
  assert.match(html, /Evidence:<\/b> Rice protein/, "the ingredient renders verbatim");
  assert.match(html, /Capability:<\/b> Protein &amp; peptides/, "the capability renders as a readable label");
  assert.match(html, /Rice protein provides the protein\/peptide capability/, "and the Lab's statement follows verbatim");
  assert.match(html, /Boundary:<\/b> This recommendation addresses temporary fibre reinforcement/, "the limitation renders");

  // The things that make it a product: price, and a way to buy.
  assert.match(html, /\$24\.99/);
  assert.match(html, /Add to Cart|Shop Product/);
});

test("a single authorized match never reads as a broken or incomplete page", () => {
  const html = render();
  assert.match(html, /One product earned a direct CrownPrint match/, "it is framed as a precise result");
  assert.match(html, /Only\s+products explicitly authorized by CrownPrint appear here/);
  // No count-shaped language that invites "only one?"
  assert.equal(/\b1 match\b|\bonly 1\b|\b1 result\b/i.test(html), false);
});

// ---------------------------------------------------------------------------
// 2–4. Coverage is explained, grouped, and never shaped like a product.
// ---------------------------------------------------------------------------
test("coverage renders as three distinct explanatory groups", () => {
  const html = render({ coverage: COVERAGE });

  assert.match(html, /Your other CrownPrint needs/);
  assert.match(html, /Wynn Essentials can cover/);
  assert.match(html, /Wynn Essentials can partially support/);
  assert.match(html, /Wynn Essentials does not currently carry/);

  assert.match(html, /Gentle cleansing/);
  assert.match(html, /Heat protection/);
  assert.match(html, /does not deliver water into the fibre/, "the recorded limitation is shown, not softened");
});

test("a covered function does NOT look like a direct match", () => {
  const html = render({ coverage: COVERAGE });
  const needs = section(html, "cp-otherneeds", ["cp-functions-inline", "cp-utility"]);

  // No unauthorized product is NAMED here at all: the guidance layer strips a
  // qualifying name unless that product is also an authorized match.
  assert.equal(/Lathyr|Nourish/.test(needs), false, "an unauthorized product is not named in coverage");
  assert.match(needs, /Gentle cleansing/, "the FUNCTION is still explained");
  // And it carries none of the signals that mean "we chose this for you".
  assert.equal(/cp-card\b/.test(needs), false, "no product card");
  assert.equal(/Add to Cart/.test(needs), false, "no add-to-bag");
  assert.equal(/href="\/products\//.test(needs), false, "no product link");
  assert.equal(/cp-badge/.test(needs), false, "no match-class badge");
  assert.equal(/\$\d/.test(needs), false, "no price");
});

test("the page explains why coverage is not a match", () => {
  const html = render({ coverage: COVERAGE });
  assert.match(html, /can belong to a function Wynn Essentials is capable of supporting without being selected/);
});

test("a coverage-only product name never becomes a rendered product card", () => {
  // Lathyr appears in coverage and NOT in matches. It may be read about; it may
  // not be sold. This is the presentation half of the matches-only guarantee.
  const html = render({ coverage: COVERAGE });
  const cardArea = html.slice(0, html.indexOf('class="cp-otherneeds'));
  assert.equal(/Lathyr/.test(cardArea), false, "Lathyr is not in the match card area");
});

// ---------------------------------------------------------------------------
// 5. An accessory is separate, and speaks a different vocabulary.
// ---------------------------------------------------------------------------
test("an accessory renders in its own section with mechanical, not formulation, language", () => {
  const html = render({ accessories: [ACCESSORY], coverage: COVERAGE });

  assert.match(html, /Routine support/i);
  assert.match(html, /Soft Life Bonnet/);
  assert.match(html, /reduced overnight friction against bedding/);
  assert.match(html, /work mechanically/, "the mechanism is explained as mechanical");
  assert.match(html, /not<\/b> CrownPrint formulation matches/, "and explicitly separated from matches");
});

test("an accessory never carries formulation-evidence vocabulary", () => {
  const html = render({ accessories: [ACCESSORY], coverage: COVERAGE });
  const acc = section(html, "cp-functions-inline cp-accessories-inline", ["cp-otherneeds", "cp-utility"]);

  for (const banned of ["Why it qualifies", "CrownPrint function:", "Strong Match", "cp-badge", "capability"]) {
    assert.equal(acc.includes(banned), false, `accessory section must not use "${banned}"`);
  }
  assert.equal(/cp-card\b/.test(acc), false, "an accessory is not a match card");
});

// ---------------------------------------------------------------------------
// Empty state.
// ---------------------------------------------------------------------------
test("zero authorized matches explains itself and offers no fallback product", () => {
  const html = render({ products: [], coverage: COVERAGE, hasStrong: false, noStrongMatch: true });

  assert.match(html, /No direct Wynn Essentials product match was authorized for this recommendation set/);
  assert.match(html, /does not mean Wynn Essentials has nothing relevant to your hair/);
  // The coverage explanation still runs, so the page is informative rather than blank.
  assert.match(html, /Your other CrownPrint needs/);
  // And no product was substituted in.
  assert.equal(/Add to Cart/.test(html), false, "no fallback product card");
  assert.equal(/cp-badge-strong/.test(html), false);
});

test("the empty state is not an error", () => {
  const html = render({ products: [], coverage: COVERAGE, hasStrong: false, noStrongMatch: true });
  for (const scary of ["error", "went wrong", "failed", "try again later"]) {
    assert.equal(new RegExp(scary, "i").test(html.slice(html.indexOf("cp-noauth"), html.indexOf("cp-otherneeds"))), false,
      `the empty state must not read as an error ("${scary}")`);
  }
});

// ---------------------------------------------------------------------------
// Evidence language stays mechanism, never performance.
// ---------------------------------------------------------------------------
test("evidence is rendered verbatim and no efficacy claim is added by Wynn", () => {
  const html = render();
  // Wynn adds no verb of its own around the Lab's statement.
  for (const claim of ["repairs damaged hair", "guaranteed", "clinically proven", "cures", "treats"]) {
    assert.equal(new RegExp(claim, "i").test(html), false, `Wynn must not claim "${claim}"`);
  }
});

test("a match with no evidence, function or limitation from HWL simply shows less", () => {
  const bare = { ...REVAIVL };
  delete bare.functionServed;
  delete bare.evidence;
  delete bare.limitation;
  const html = render({ products: [bare] });

  assert.match(html, /Revaivl/);
  assert.equal(/Evidence:/.test(html), false, "no evidence line is invented");
  assert.equal(/Capability:/.test(html), false, "and no capability line is invented");
  assert.equal(/CrownPrint function:/.test(html), false, "no function is invented");
  // And no boundary is invented either. A boundary Wynn wrote itself would read
  // as the Lab's verdict on what this product does not do.
  assert.equal(/Boundary:/.test(html), false, "no limitation is invented");
});

// ---------------------------------------------------------------------------
// No raw contract identifier reaches a customer.
//
// The payload keeps its machine identifiers — that is the contract, and an
// audit needs them. They are simply not customer copy: "Capability:
// proteins_peptides" is a database column on a product card, and it undermines
// the care taken over every other line.
// ---------------------------------------------------------------------------

/** snake_case tokens — the shape every HWL identifier takes. */
const SNAKE_CASE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

test("no raw snake_case contract identifier appears anywhere in the rendered output", () => {
  const html = render({
    coverage: [
      { functionKey: "cleanse_scalp", status: "covered", label: "Gentle cleansing", detail: "d", qualifyingProducts: [] },
      // No functionLabel: the key must be humanized rather than printed raw.
      { functionKey: "reduce_surface_friction", status: "partial", label: "Reduce surface friction", detail: "d", qualifyingProducts: [] },
      { functionKey: "heat_protection", status: "not_carried", label: "Heat protection", detail: "d", qualifyingProducts: [] },
    ],
    accessories: [ACCESSORY],
  });

  // Attributes AND text: a key hidden in a data-* attribute is still shipped to
  // the browser, and is one view-source away from a customer.
  const leaks = [...new Set(html.match(SNAKE_CASE) ?? [])];
  assert.deepEqual(leaks, [], `raw contract identifiers reached the page: ${leaks.join(", ")}`);
});

test("the visible text carries the label, and the key is nowhere on the page", () => {
  const html = render();
  const text = html.replace(/<[^>]+>/g, " ");

  assert.match(text, /Capability:\s*Protein &amp; peptides/, "the readable label is what a customer sees");
  assert.equal(/proteins_peptides/.test(html), false, "the raw key is not in the markup at all");
});

test("an unmapped capability key still never renders raw", () => {
  const exotic = { ...REVAIVL, evidence: { ingredient: "Something new", capabilityKey: "humidity_resistance_barrier" } };
  const html = render({ products: [exotic] });

  assert.equal(/humidity_resistance_barrier/.test(html), false, "the raw key never reaches the page");
  assert.match(html, /Capability:<\/b> Humidity resistance barrier/, "it degrades to a readable form");
});

// ---------------------------------------------------------------------------
// CAPABILITY VOCABULARY — the complete HWL #642 set for wynn-product-profile-v1.
//
// The mechanical snake_case fallback is defensive handling for unexpected
// input, NOT the production path. Every canonical key carries deliberate copy;
// anything else announces itself rather than rendering almost-right forever.
// ---------------------------------------------------------------------------

test("1. the label map equals the canonical vocabulary in BOTH directions", () => {
  assert.equal(HWL_CANONICAL_CAPABILITY_KEYS.length, 9, "the proven vocabulary is nine keys");

  assert.deepEqual(
    [...HWL_CANONICAL_CAPABILITY_KEYS].sort(),
    Object.keys(CAPABILITY_LABELS).sort(),
    "every canonical key has a label and every label has a canonical key",
  );

  // Capabilities HWL cannot emit for this catalog stay deliberately unlabelled,
  // so a future one fails visibly instead of using copy somebody guessed at.
  for (const key of CAPABILITIES_NOT_EMITTABLE) {
    assert.equal(hasCapabilityLabel(key), false, `"${key}" must not be pre-labelled — it cannot be emitted yet`);
  }
});

test("2. no canonical key relies on the mechanical fallback", () => {
  for (const key of HWL_CANONICAL_CAPABILITY_KEYS) {
    const label = capabilityLabel(key);
    assert.ok(hasCapabilityLabel(key), `"${key}" has no deliberate copy`);
    // The precise property: the label is NOT what the fallback would generate.
    assert.notEqual(
      label,
      mechanicalFallbackLabel(key),
      `"${key}" renders exactly what the mechanical fallback would produce`,
    );
    assert.equal(/_/.test(label), false, `"${key}" produced a label containing an underscore`);
  }
});

test("3. unlabeledCapabilities is empty across the entire canonical vocabulary", () => {
  // Mirrors what the audit computes for a payload using every canonical key.
  const unlabeled = HWL_CANONICAL_CAPABILITY_KEYS.filter((k) => !hasCapabilityLabel(k));
  assert.deepEqual(unlabeled, [], "no canonical capability is missing copy");
});

test("4. an unknown future key stays visible to the audit rather than being invented", () => {
  // A capability HWL cannot emit today, and one that is simply unrecognized.
  for (const unknown of ["chelators", "humidity_resistance_barrier"]) {
    assert.equal(HWL_CANONICAL_CAPABILITY_KEYS.includes(unknown), false);
    assert.equal(hasCapabilityLabel(unknown), false, `Wynn must not pretend to have copy for "${unknown}"`);
  }

  // It still cannot reach a customer raw — the fallback is the safety net.
  const html = render({
    products: [{ ...REVAIVL, evidence: { ingredient: "Something new", capabilityKey: "heat_protection_systems" } }],
  });
  assert.equal(/heat_protection_systems/.test(html), false, "the raw key never reaches the page");
  assert.match(html, /Capability:<\/b> Heat protection systems/, "it degrades defensively");

  // And the audit's filter — the same helper — names it.
  const unlabeled = ["proteins_peptides", "heat_protection_systems"].filter((k) => !hasCapabilityLabel(k));
  assert.deepEqual(unlabeled, ["heat_protection_systems"]);
});

test("5. no raw multi-word snake_case capability identifier reaches customer markup", () => {
  for (const key of HWL_CANONICAL_CAPABILITY_KEYS) {
    const html = render({
      products: [{ ...REVAIVL, evidence: { ingredient: "Rice protein", capabilityKey: key } }],
      coverage: [
        { functionKey: "cleanse_scalp", status: "covered", label: "Gentle cleansing", detail: "d", qualifyingProducts: [] },
        { functionKey: "reduce_surface_friction", status: "partial", label: "Reduce surface friction", detail: "d", qualifyingProducts: [] },
        { functionKey: "heat_protection", status: "not_carried", label: "Heat protection", detail: "d", qualifyingProducts: [] },
      ],
      accessories: [ACCESSORY],
    });

    // Multi-word keys have a raw form distinguishable from English; single-word
    // ones ("surfactants") legitimately appear inside their own label.
    if (key.includes("_")) {
      assert.equal(new RegExp(key).test(html), false, `"${key}" reached the page raw`);
    }
    assert.match(html, new RegExp(`Capability:</b> ${CAPABILITY_LABELS[key].replace(/&/g, "&amp;")}`));

    const leaks = [...new Set(html.match(SNAKE_CASE) ?? [])];
    assert.deepEqual(leaks, [], `raw identifiers reached the page for "${key}": ${leaks.join(", ")}`);
  }
});
