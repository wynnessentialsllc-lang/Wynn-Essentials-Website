import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CORE_AXES, STATE_FIELDS, normalizeCrownState, parseCrownPrintCode } from "../lib/crownprint-code.ts";
import { normalizeMatchContext } from "../lib/crownprint-state.mjs";
import { selectGuidance } from "../lib/crownprint-guidance.ts";
import {
  MATCH_CLASS_DEFINITIONS,
  MATCH_CLASS_ORDER,
  MATCH_LEGEND,
  coreSignal,
  legendContextNote,
  stateSignal,
} from "../lib/crownprint-match-intelligence.ts";
import { products } from "../app/data.ts";

// ---------------------------------------------------------------------------
// CUSTOMER-FACING MATCH INTELLIGENCE
//
// "Strong", "Good", and "Conditional" are the three words a shopper uses to
// decide what to buy. These tests pin the promises made about them:
//
//   • all three are DEFINED to the shopper, in the shopper's own language;
//   • the definitions describe FIT, and say plainly that fit is not quality;
//   • every single rendered match carries reasoning built from that shopper's
//     own CrownPrint signals — never a bare label, never a generic sentence;
//   • a Conditional Match names its condition, when it applies, and when it
//     does not;
//   • nothing internal leaks: no percentages, no scores, no weights, no
//     thresholds, no rule identifiers;
//   • a trusted CrownPrint 360 context outranks the manual Core fallback, and
//     the fallback never claims 360-level certainty;
//   • Wynn selling a product is never, on its own, grounds for a Strong Match.
// ---------------------------------------------------------------------------

const catalog = products;

const profile = (code, state = {}) => ({
  core: parseCrownPrintCode(code).core,
  state: normalizeCrownState(state),
});

/** A spread of real shoppers, so nothing below passes on one lucky fixture. */
const PROFILES = [
  profile("P2-D3-T3-S2-E2", { style: "braids", stage: "takedown-soon", scalp: "tender", concern: "dryness" }),
  profile("P3-D1-T1-S1-E1", { style: "natural", scalp: "flaky", concern: "breakage", goal: "repair" }),
  profile("P1-D3-T1-S3-E3", { style: "silkpress", scalp: "oily", concern: "buildup" }),
  profile("P3-D2-T3-S4-E1", { style: "locs", scalp: "itchy", concern: "shedding", goal: "growth" }),
  profile("P2-T3", { style: "wig", concern: "definition" }),
  profile("", { style: "twists", concern: "frizz" }),
];

const localGuidance = (p) => selectGuidance({ profile: p, catalog });

/**
 * Every signal label THIS shopper could legitimately be shown, derived straight
 * from the axes and answers they actually gave. A rationale citing anything
 * outside this set would be reasoning about somebody else.
 */
const ownSignalLabels = (p) =>
  new Set(
    [
      ...CORE_AXES.map((axis) => coreSignal(axis.id, p.core[axis.id])),
      ...STATE_FIELDS.map((field) => stateSignal(field.id, p.state[field.id])),
    ]
      .filter(Boolean)
      .map((s) => s.label),
  );

/** A fully resolved CrownPrint 360, shaped like a real HWL response. */
const resolved360 = (overrides = {}) =>
  normalizeMatchContext({
    crownPrintPresent: true,
    entitlementActive: true,
    entitlementStatus: "active",
    assessmentComplete: true,
    resultsReady: true,
    crownPrintCode: "P2-D3-T3-S2-E2",
    crownState: { present: true, fresh: true, summary: "braids, nearing takedown, tender scalp" },
    currentPriorityLabel: "Scalp comfort",
    currentPriorities: [
      { label: "Scalp comfort", detail: "The scalp is the limiting factor right now." },
      { label: "Moisture balance", detail: "Retention, not application, is the lever." },
    ],
    productFunctionsNeeded: [
      { label: "Scalp comfort care", detail: "Applied directly to the parts while styled." },
      { label: "Water-based daily moisture", detail: "Light enough to reach through braids." },
    ],
    matches: [
      { productKey: "relief-oil", productName: "Relief", matchClass: "strong", why: "The Lab resolved your scalp as the first thing to solve while you are styled." },
      { productKey: "edge-control", productName: "Edge Control", matchClass: "conditional", why: "The Lab resolved this as situational for your current style." },
    ],
    ...overrides,
  });

/** Every shopper-visible string a rationale can put on a card. */
const rationaleStrings = (r) =>
  [r.heading, r.explanation, r.functionServed, r.condition, r.whenItApplies, r.whenItMayNotBeNeeded, r.contextNote, ...r.signals]
    .filter(Boolean);

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");

/** Renders a route through the built vinext worker (same helper as rendered-html). */
async function render(path) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const res = await worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(res.status, 200, `${path} should render`);
  return res.text();
}

// ---------------------------------------------------------------------------
// 1. All three classifications have customer-facing definitions.
// ---------------------------------------------------------------------------
test("1. Strong, Good, and Conditional each carry a customer-facing definition", async () => {
  assert.deepEqual(MATCH_CLASS_ORDER, ["strong", "good", "conditional"]);

  for (const cls of MATCH_CLASS_ORDER) {
    const definition = MATCH_CLASS_DEFINITIONS[cls];
    assert.equal(definition.title, `${cls.toUpperCase()} MATCH`);
    assert.ok(definition.headline.length > 20, `${cls} needs a headline a shopper can read`);
    assert.ok(definition.definition.length > 60, `${cls} needs a real definition, not a label`);
    // Written to the shopper, not about them.
    assert.match(`${definition.headline} ${definition.definition}`, /\byou\b|\byour\b/i);
    assert.doesNotMatch(definition.definition, /\bshopper('s)?\b/i, "the definition addresses the reader directly");
  }

  // The specific promises the three definitions have to make.
  assert.match(MATCH_CLASS_DEFINITIONS.strong.headline, /high alignment/i);
  assert.match(MATCH_CLASS_DEFINITIONS.strong.definition, /higher-priority product functions/i);
  assert.match(MATCH_CLASS_DEFINITIONS.strong.definition, /trusted CrownPrint context/i);
  assert.match(MATCH_CLASS_DEFINITIONS.good.headline, /useful support/i);
  assert.match(MATCH_CLASS_DEFINITIONS.good.definition, /less central|less comprehensive|less strongly supported/i);
  assert.match(MATCH_CLASS_DEFINITIONS.conditional.headline, /depending on when and how/i);
  assert.match(
    MATCH_CLASS_DEFINITIONS.conditional.definition,
    /CrownState.*protective stage.*scalp condition.*environment.*hair history.*heat or chemical exposure/is,
    "a Conditional Match must name the kinds of context its relevance depends on",
  );

  // And the legend that carries them is titled the way the page promises.
  assert.equal(MATCH_LEGEND.title, "How Your CrownPrint Matches Work");

  // The legend renders all three, above the results, on BOTH surfaces.
  const [finder, experience] = await Promise.all([
    read("../app/crownprint/CrownPrintFinder.tsx"),
    read("../app/shop-by-crownprint/CrownPrintExperience.tsx"),
  ]);
  for (const [name, source] of [["/crownprint", finder], ["/shop-by-crownprint", experience]]) {
    const legendAt = source.indexOf("<MatchLegend");
    const firstGroupAt = source.indexOf('<MatchGroup cls="strong"');
    assert.ok(legendAt > -1, `${name} must render the Match Intelligence legend`);
    assert.ok(firstGroupAt > -1 && legendAt < firstGroupAt, `${name} must render the legend BEFORE the results`);
  }

  const legend = await read("../app/MatchIntelligence.tsx");
  assert.match(legend, /MATCH_CLASS_ORDER\.map/, "the legend renders every class, not a hand-picked subset");
});

// ---------------------------------------------------------------------------
// 2. Product quality is distinguished from CrownPrint fit.
// ---------------------------------------------------------------------------
test("2. the legend separates degree-of-fit from product quality, explicitly", () => {
  const quality = MATCH_LEGEND.quality;
  assert.match(quality, /degree and context of fit/i);
  assert.match(quality, /not a rating of product quality/i);
  assert.match(quality, /Good Match or a Conditional Match is not a bad product/i);

  // Core is the foundation; the dynamic factors are what re-order priority.
  const change = MATCH_LEGEND.change;
  assert.match(change, /CrownPrint Core/);
  assert.match(change, /foundation/i);
  assert.match(change, /stays relatively stable/i);
  assert.match(change, /CrownState/);
  assert.match(change, /deserve priority/i);
  assert.match(change, /heat or chemical exposure/i);

  // A Good Match's own card says the same thing where the shopper is deciding.
  const good = localGuidance(PROFILES[0]).matches.find((m) => m.matchClass === "good");
  assert.ok(good, "the reference profile should produce at least one Good Match");
  assert.match(
    good.rationale.explanation,
    /priority order, not about the product|not support|didn't include/i,
    "a Good Match must explain its class without implying the product is worse",
  );

  // Nothing anywhere calls a non-strong match bad, cheap, weak, or inferior.
  for (const p of PROFILES) {
    for (const m of localGuidance(p).matches) {
      for (const text of rationaleStrings(m.rationale)) {
        assert.doesNotMatch(text, /\b(inferior|low[- ]quality|second[- ]rate|worse product|cheap)\b/i);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Every rendered match contains individualized reasoning.
// ---------------------------------------------------------------------------
test("3. every match carries reasoning built from that shopper's own signals", () => {
  let seen = 0;
  for (const p of PROFILES) {
    const guidance = localGuidance(p);
    const own = ownSignalLabels(p);
    for (const m of guidance.matches) {
      seen++;
      const r = m.rationale;
      assert.equal(r.matchClass, m.matchClass, `${m.productKey}: the heading must match the class shown`);
      assert.equal(r.heading, MATCH_CLASS_DEFINITIONS[m.matchClass].cardHeading);
      assert.ok(r.explanation.length > 140, `${m.productKey}: reasoning must be an explanation, not a slogan`);
      assert.ok(r.signals.length > 0, `${m.productKey}: the signals responsible must be named`);
      assert.ok(r.functionServed.length > 3, `${m.productKey}: the product function must be named`);

      // It connects the shopper's signals to the FUNCTION being recommended —
      // that connection is what makes it reasoning rather than a restatement.
      assert.ok(
        r.explanation.includes(r.functionServed) || r.explanation.toLowerCase().includes(r.functionServed.toLowerCase()),
        `${m.productKey}: the reasoning must name the function it serves`,
      );
      assert.ok(r.explanation.includes(m.productName), `${m.productKey}: the reasoning must name the product`);

      // Every cited signal is one THIS shopper actually gave us. Nothing is
      // borrowed from a default profile, and nothing is invented to pad a card.
      for (const label of r.signals) {
        assert.ok(own.has(label), `${m.productKey}: cites "${label}", which this shopper never gave us`);
      }
    }
  }
  assert.ok(seen > 25, `only ${seen} matches exercised — the fixtures are too thin to prove this`);

  // Individualized, not templated: the SAME product explains itself differently
  // to two different CrownPrints.
  const dry = localGuidance(profile("P3-D2-T3-S2-E2", { concern: "dryness" }));
  const breakage = localGuidance(profile("P1-D1-T1-S2-E1", { concern: "breakage" }));
  const a = dry.matches.find((m) => m.productKey === "uplyft-conditioner");
  const b = breakage.matches.find((m) => m.productKey === "uplyft-conditioner");
  assert.ok(a && b);
  assert.notEqual(a.rationale.explanation, b.rationale.explanation, "the same product must not give both shoppers the same reason");
  assert.notDeepEqual(a.rationale.signals, b.rationale.signals);

  // And across a whole result set, no two cards share an explanation.
  const explanations = localGuidance(PROFILES[0]).matches.map((m) => m.rationale.explanation);
  assert.equal(new Set(explanations).size, explanations.length, "every card must explain itself, not repeat the page");

  // The reasoning does not merely read the answers back: a signal a shopper gave
  // that has nothing to do with a product never turns up on its card.
  const oily = localGuidance(profile("P2-D2-T2-S3-E2", { scalp: "oily", concern: "buildup" }));
  const cleanse = oily.matches.find((m) => m.productKey === "lathyr-shampoo");
  assert.ok(cleanse);
  assert.ok(
    cleanse.rationale.signals.some((s) => /oily|buildup/i.test(s)),
    "the cleanser must cite the signals that actually pointed at it",
  );
});

// ---------------------------------------------------------------------------
// 4. Conditional matches identify their condition.
// ---------------------------------------------------------------------------
test("4. a Conditional Match names its condition, when it applies, and when it doesn't", () => {
  let conditionals = 0;
  for (const p of [...PROFILES, profile("P2-D2-T2-S2-E2", { style: "braids" })]) {
    for (const m of localGuidance(p).matches.filter((x) => x.matchClass === "conditional")) {
      conditionals++;
      const r = m.rationale;
      assert.equal(r.heading, "WHY THIS MATCH IS CONDITIONAL");
      assert.match(r.condition ?? "", /^What makes it relevant: .{25,}/, `${m.productKey}: the condition must be stated`);
      assert.match(r.whenItApplies ?? "", /^When to consider it: .{25,}/, `${m.productKey}: when to use it must be stated`);
      assert.match(
        r.whenItMayNotBeNeeded ?? "",
        /^When it may not be necessary: .{25,}/,
        `${m.productKey}: when it is NOT needed must be stated`,
      );
      // The condition is a real circumstance of THIS shopper's, not a generic
      // disclaimer: it is built on one of the signals named on the same card.
      assert.doesNotMatch(r.condition, /it depends\.?$/i);
      assert.ok(r.conditionSignal, `${m.productKey}: the condition must name the signal it turns on`);
      assert.ok(
        r.signals.includes(r.conditionSignal),
        `${m.productKey}: the condition turns on "${r.conditionSignal}", which isn't among its own signals`,
      );
    }
  }
  assert.ok(conditionals >= 4, `only ${conditionals} conditional matches exercised`);

  // Strong and Good matches do NOT carry conditional framing — the three extra
  // lines are what the class means, not decoration on every card.
  for (const p of PROFILES) {
    for (const m of localGuidance(p).matches.filter((x) => x.matchClass !== "conditional")) {
      assert.equal(m.rationale.condition, undefined, `${m.productKey} is not conditional and must not read as if it were`);
      assert.equal(m.rationale.whenItApplies, undefined);
      assert.equal(m.rationale.whenItMayNotBeNeeded, undefined);
    }
  }

  // A conditional match resolved by the Lab gets the same three lines.
  const resolved = selectGuidance({ context: resolved360(), catalog }).matches.find((m) => m.matchClass === "conditional");
  assert.ok(resolved, "the fixture resolves one conditional match");
  assert.ok(resolved.rationale.condition && resolved.rationale.whenItApplies && resolved.rationale.whenItMayNotBeNeeded);
});

// ---------------------------------------------------------------------------
// 5. No percentages, scores, weights, thresholds, or rule identifiers.
// ---------------------------------------------------------------------------
test("5. nothing internal is exposed — no percentages, no scores, no weights", async () => {
  const FORBIDDEN = [
    [/\d\s*%/, "a match percentage"],
    [/\b\d+(\.\d+)?\s*percent\b/i, "a match percentage"],
    [/\bscores?\b/i, "an internal score"],
    [/\bscoring\b/i, "internal scoring"],
    [/\bweighted?\b|\bweighting\b/i, "an internal weight"],
    [/\bthresholds?\b/i, "an internal threshold"],
    [/\brule\s*(id|#|number)/i, "a rule identifier"],
    [/\b\d+\s*(points?|pts)\b/i, "internal points"],
    [/\b\d+\s*(out of|\/)\s*(10|100)\b/i, "a numeric rating"],
    [/\bconfidence\s*(score|level|of)\s*\d/i, "a numeric confidence"],
  ];
  const scan = (text, where) => {
    for (const [pattern, what] of FORBIDDEN) {
      assert.doesNotMatch(text, pattern, `${where} exposes ${what}: ${JSON.stringify(text)}`);
    }
  };

  // The legend copy.
  for (const [key, value] of Object.entries(MATCH_LEGEND)) scan(value, `MATCH_LEGEND.${key}`);
  for (const cls of MATCH_CLASS_ORDER) {
    const d = MATCH_CLASS_DEFINITIONS[cls];
    scan(`${d.title} ${d.headline} ${d.definition} ${d.cardHeading}`, `the ${cls} definition`);
  }
  for (const source of ["crownprint-360", "core", "core-partial", "crownstate-only"]) {
    scan(legendContextNote(source), `the ${source} legend note`);
  }

  // Every rationale, on both paths.
  const everything = [
    ...PROFILES.map((p) => localGuidance(p)),
    selectGuidance({ context: resolved360(), catalog }),
  ];
  for (const guidance of everything) {
    for (const m of guidance.matches) {
      for (const text of rationaleStrings(m.rationale)) scan(text, `${m.productKey}'s reasoning`);
    }
  }

  // The internal ordering value is never handed to a client component.
  const [finder, experience, finderPage, experiencePage] = await Promise.all([
    read("../app/crownprint/CrownPrintFinder.tsx"),
    read("../app/shop-by-crownprint/CrownPrintExperience.tsx"),
    read("../app/crownprint/page.tsx"),
    read("../app/shop-by-crownprint/page.tsx"),
  ]);
  for (const [name, source] of [["CrownPrintFinder", finder], ["CrownPrintExperience", experience]]) {
    assert.doesNotMatch(source, /\bscore\b/, `${name} must never read the internal ordering value`);
  }
  for (const [name, source] of [["/crownprint", finderPage], ["/shop-by-crownprint", experiencePage]]) {
    assert.doesNotMatch(source, /score:/, `${name} must never pass the internal ordering value to the client`);
  }
});

// ---------------------------------------------------------------------------
// 6. A trusted CrownPrint 360 context outranks the Core fallback.
// ---------------------------------------------------------------------------
test("6. trusted 360 context is the primary source, and the fallback says it is not", () => {
  const context = resolved360();
  const local = profile("P2-D3-T3-S2-E2", { style: "braids", scalp: "tender", concern: "dryness" });

  // Both present — the 360 wins, and every card says where it came from.
  const guidance = selectGuidance({ context, profile: local, catalog });
  assert.equal(guidance.source, "crownprint-360");
  for (const m of guidance.matches) {
    assert.match(m.rationale.contextNote, /trusted CrownPrint 360/i, `${m.productKey} must cite the trusted context`);
    assert.doesNotMatch(m.rationale.contextNote, /less context/i);
  }
  assert.match(legendContextNote(guidance.source), /trusted CrownPrint 360 context/i);
  assert.match(legendContextNote(guidance.source), /fullest context/i);

  // And the reasoning is HWL's, not the local engine's wording.
  const relief360 = guidance.matches.find((m) => m.productKey === "relief-oil");
  const reliefLocal = localGuidance(local).matches.find((m) => m.productKey === "relief-oil");
  assert.notEqual(relief360.rationale.explanation, reliefLocal.rationale.explanation);
  assert.match(relief360.rationale.explanation, /Lab/);

  // The manual fallback must never imply 360-level certainty — on the legend or
  // on any individual card.
  for (const [source, fallbackProfile] of [
    ["core", profile("P2-D3-T3-S2-E2", { concern: "dryness" })],
    ["core-partial", profile("P2-T3", { concern: "dryness" })],
    ["crownstate-only", profile("", { concern: "dryness", style: "braids" })],
  ]) {
    const fallback = localGuidance(fallbackProfile);
    assert.equal(fallback.source, source);
    const note = legendContextNote(source);
    assert.match(note, /less context|lightest context/i, `the ${source} legend must admit it has less context`);
    assert.match(note, /not a 360-level verdict|rather than a verdict/i, `the ${source} legend must not claim a 360 verdict`);
    assert.match(note, /Hair Wellness Lab/, `the ${source} legend must point at the fuller source`);

    for (const m of fallback.matches) {
      assert.doesNotMatch(m.rationale.contextNote, /trusted CrownPrint 360/i, `${m.productKey} must not borrow 360 provenance`);
      assert.match(m.rationale.contextNote, /less context|far less context/i);
    }
  }

  // A revoked entitlement is not a trusted context, so it cannot lend its
  // provenance to a card either.
  const revoked = normalizeMatchContext({
    crownPrintPresent: true,
    entitlementStatus: "refunded",
    crownState: { present: true, fresh: true },
    matches: [{ productKey: "relief-oil", productName: "Relief", matchClass: "strong", why: "…" }],
  });
  const afterRevoke = selectGuidance({ context: revoked, profile: local, catalog });
  assert.notEqual(afterRevoke.source, "crownprint-360");
  for (const m of afterRevoke.matches) {
    assert.doesNotMatch(m.rationale.contextNote, /trusted CrownPrint 360/i);
  }
});

// ---------------------------------------------------------------------------
// 7. Selling a product is never grounds for a Strong Match.
// ---------------------------------------------------------------------------
test("7. Wynn never promotes its own catalog to Strong without HWL's verdict", () => {
  const guidance = selectGuidance({ context: resolved360(), catalog });

  // Since the contract hardening this is stronger than "no Strong without HWL":
  // there is no card at ANY class without HWL. Wynn no longer fills a resolved
  // function from its own catalog, so every match traces to a Lab verdict —
  // product key AND class alike.
  const resolvedClass = new Map(resolved360().matches.map((m) => [m.productKey, m.matchClass]));
  for (const m of guidance.matches) {
    assert.ok(resolvedClass.has(m.productKey), `${m.productKey} rendered without an HWL verdict`);
    assert.equal(m.matchClass, resolvedClass.get(m.productKey), `${m.productKey} was re-classified by Wynn`);
  }

  // Hydrate serves a resolved function the Lab named no product for. It used to
  // be filled in at Good. It is not rendered at all now.
  assert.equal(
    guidance.matches.some((m) => m.productKey === "hydrate-herbal-hair-mist"),
    false,
    "a function Wynn could serve is not a product HWL resolved",
  );

  // With only a conditional verdict from HWL, that is the entire page —
  // however many resolved functions Wynn's catalog happens to be able to cover.
  const noStrong = selectGuidance({
    context: resolved360({
      matches: [{ productKey: "edge-control", productName: "Edge Control", matchClass: "conditional", why: "Resolved as conditional." }],
    }),
    catalog,
  });
  assert.deepEqual(noStrong.matches.map((m) => m.productKey), ["edge-control"]);
  assert.equal(noStrong.matches.some((m) => m.matchClass === "strong"), false);
  assert.equal(noStrong.noStrongMatch, true);

  // On the local path the same rule holds from the other direction: a product
  // reaches Strong only when THIS CrownPrint points at it. A profile with no
  // signals at all sells nothing.
  const empty = localGuidance(profile("", {}));
  assert.equal(empty.matches.length, 0, "an empty profile must not surface the catalog");
  const thin = localGuidance(profile("", { style: "braids" }));
  assert.equal(thin.matches.some((m) => m.matchClass === "strong"), false);

  // And every local match names the signals that earned it — being on the shelf
  // is never one of them.
  for (const p of PROFILES) {
    for (const m of localGuidance(p).matches) {
      assert.ok(m.rationale.signals.length > 0, `${m.productKey} has no shopper signal behind it`);
      for (const text of rationaleStrings(m.rationale)) {
        assert.doesNotMatch(text, /best[- ]sell|our most popular|customer favou?rite/i);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 8. The same guarantees, against the actual rendered page.
//
// Everything above reasons about the model. This renders /crownprint through
// the built worker and checks the HTML a shopper is really served, so a card
// can never quietly lose its reasoning to a markup change.
// ---------------------------------------------------------------------------
test("8. the rendered page carries the legend and one explanation per card", async () => {
  const html = await render("/crownprint?cp=P2-D3-T3-S2-E2&style=braids&scalp=tender&concern=dryness");

  // The legend is on the page, defines all three classes, and comes first.
  const legendAt = html.indexOf("How Your CrownPrint Matches Work");
  const firstCardAt = html.indexOf("cp-card-need");
  assert.ok(legendAt > -1, "the legend must be rendered");
  assert.ok(firstCardAt > -1, "this fixture must produce product cards");
  assert.ok(legendAt < firstCardAt, "the legend must appear before the first recommendation");
  for (const cls of MATCH_CLASS_ORDER) {
    assert.ok(html.includes(MATCH_CLASS_DEFINITIONS[cls].title), `${cls} must be defined on the page`);
    assert.ok(html.includes(MATCH_CLASS_DEFINITIONS[cls].definition.slice(0, 60)), `${cls}'s definition must be rendered`);
  }
  assert.ok(html.includes("not a rating of product quality"), "fit must be separated from quality on the page");

  // ...but it is COMPACT at rest. The resting legend is three rows and a
  // control; the definitions and the education sit behind "How matches work",
  // so a shopper revisiting their matches doesn't scroll past a wall of text to
  // reach the products.
  const rowsAt = html.indexOf("cp-legend-rows");
  const moreAt = html.indexOf("cp-legend-more");
  const sourceAt = html.indexOf("cp-legend-source");
  assert.ok(rowsAt > -1 && moreAt > rowsAt && sourceAt > moreAt, "the legend must render rows, then the control, then provenance");
  assert.match(html.slice(moreAt - 400, moreAt), /<details/, '"How matches work" must be a real disclosure control');
  assert.ok(html.includes(MATCH_LEGEND.expandLabel), "the expand control must be labelled");

  const resting = html.slice(rowsAt, moreAt);
  const behindControl = html.slice(moreAt, sourceAt);
  for (const cls of MATCH_CLASS_ORDER) {
    const { title, headline, definition } = MATCH_CLASS_DEFINITIONS[cls];
    assert.ok(resting.includes(title), `${cls}'s badge must be visible without expanding anything`);
    assert.ok(resting.includes(headline), `${cls}'s one-line meaning must be visible without expanding anything`);
    assert.equal(resting.includes(definition.slice(0, 60)), false, `${cls}'s full definition must not sit in the resting legend`);
    assert.ok(behindControl.includes(definition.slice(0, 60)), `${cls}'s full definition must be behind the control`);
  }
  assert.ok(behindControl.includes("not a rating of product quality"), "the quality note belongs with the definitions");
  // Collapsed is not absent: everything above is still in the document, so it is
  // still crawlable and still in a screen reader's reading order.
  assert.doesNotMatch(behindControl, /hidden|aria-hidden="true"|display:\s*none/i);
  // Provenance is never behind a tap — how much context produced these results
  // is the one thing a shopper must not have to go looking for.
  assert.ok(html.slice(sourceAt, sourceAt + 600).includes("CrownPrint 360"));

  // One reasoning block per card, and the conditional lines where they belong.
  const cards = (html.match(/cp-card-need/g) || []).length;
  const reasons = (html.match(/cp-why-heading/g) || []).length;
  assert.equal(reasons, cards, "every rendered card must carry exactly one classification explanation");
  assert.ok(html.includes("WHY THIS IS A STRONG MATCH FOR YOU"));
  assert.ok(html.includes("WHY THIS MATCH IS CONDITIONAL"));
  for (const line of ["What makes it relevant:", "When to consider it:", "When it may not be necessary:"]) {
    assert.ok(html.includes(line), `a conditional card must render "${line}"`);
  }

  // And the page still shows no numbers a shopper could mistake for a rating.
  assert.doesNotMatch(html, /\d\s*%\s*match/i);
  assert.doesNotMatch(html, /match\s*(score|strength)\s*[:=]/i);
});

// ---------------------------------------------------------------------------
// 9. A change of classification rewrites the card completely.
//
// The same product can move between classes as context changes — a new
// CrownState, a re-resolved 360, a different CrownPrint. When it does, the
// heading and the reasoning must move with it and must keep NOTHING from the
// class it used to be in. This is the test that catches a stale explanation
// surviving in a cache, a memo, or a field that was set once and never
// recomputed.
// ---------------------------------------------------------------------------

/** Sentences that only ever appear in one class's reasoning. */
const CLASS_FINGERPRINTS = {
  strong: [/makes this a Strong Match for you/i, /higher-priority job/i],
  good: [/sits at Good rather than Strong/i],
  conditional: [/what Conditional means here/i, /relevance turns on when and how you use it/i],
};

/** Assert a rationale reads as its own class, and as no other. */
function assertClassPure(rationale, cls, where) {
  assert.equal(rationale.matchClass, cls, `${where}: the rationale must carry the class it is shown as`);
  assert.equal(rationale.heading, MATCH_CLASS_DEFINITIONS[cls].cardHeading, `${where}: wrong heading for ${cls}`);

  const text = rationaleStrings(rationale).join("   ");
  for (const pattern of CLASS_FINGERPRINTS[cls]) {
    assert.match(rationale.explanation, pattern, `${where}: ${cls} reasoning is missing its own wording`);
  }
  for (const other of MATCH_CLASS_ORDER.filter((c) => c !== cls)) {
    for (const pattern of CLASS_FINGERPRINTS[other]) {
      assert.doesNotMatch(text, pattern, `${where}: this ${cls} card still carries ${other} wording`);
    }
    assert.equal(
      text.includes(MATCH_CLASS_DEFINITIONS[other].cardHeading),
      false,
      `${where}: this ${cls} card still carries the ${other} heading`,
    );
  }

  // The three conditional lines exist exactly when the class is conditional.
  const conditionalFields = [rationale.condition, rationale.whenItApplies, rationale.whenItMayNotBeNeeded, rationale.conditionSignal];
  if (cls === "conditional") {
    for (const field of conditionalFields) assert.ok(field, `${where}: a conditional card must carry all of its condition lines`);
  } else {
    for (const field of conditionalFields) {
      assert.equal(field, undefined, `${where}: a ${cls} card must not keep conditional framing`);
    }
  }
}

test("9. the same product re-classified drops every trace of its previous class", () => {
  const contextFor = (matchClass) =>
    resolved360({
      matches: [{
        productKey: "relief-oil",
        productName: "Relief",
        matchClass,
        why: `The Lab resolved Relief as ${matchClass} for the context you are in right now.`,
      }],
    });
  const rationaleFor = (matchClass) =>
    selectGuidance({ context: contextFor(matchClass), catalog })
      .matches.find((m) => m.productKey === "relief-oil").rationale;

  // Strong, then Good, then Conditional — one process, one code path.
  const strong = rationaleFor("strong");
  const good = rationaleFor("good");
  const conditional = rationaleFor("conditional");

  assertClassPure(strong, "strong", "360 strong");
  assertClassPure(good, "good", "360 good");
  assertClassPure(conditional, "conditional", "360 conditional");

  // Three genuinely different explanations, not one string with a label swapped.
  const explanations = [strong.explanation, good.explanation, conditional.explanation];
  assert.equal(new Set(explanations).size, 3, "each classification must produce its own explanation");
  assert.equal(new Set([strong.heading, good.heading, conditional.heading]).size, 3);

  // Nothing is memoized across the transitions: returning to a class reproduces
  // that class's result exactly, and the states in between left no residue.
  assert.deepEqual(rationaleFor("strong"), strong, "re-resolving the same class must be deterministic");
  assert.deepEqual(rationaleFor("conditional"), conditional);

  // The order the classes are resolved in cannot change any of them.
  assert.deepEqual(
    ["conditional", "good", "strong"].map(rationaleFor),
    [conditional, good, strong],
    "results must not depend on evaluation order",
  );

  // The same product moved between classes by CHANGED CONTEXT rather than by a
  // different verdict: a stale CrownState and a re-resolved one must not leave
  // each other's wording behind either.
  const [stale, refreshed] = [
    resolved360({
      crownState: { present: true, fresh: false, summary: "braids, mid-wear, comfortable scalp", message: "Your hair needs may have changed." },
      matches: [{ productKey: "relief-oil", productName: "Relief", matchClass: "conditional", why: "Situational while your scalp is comfortable." }],
    }),
    resolved360({
      crownState: { present: true, fresh: true, summary: "just took braids down, tender scalp" },
      matches: [{ productKey: "relief-oil", productName: "Relief", matchClass: "strong", why: "Your scalp is now the first thing to solve." }],
    }),
  ].map((context) => selectGuidance({ context, catalog }).matches.find((m) => m.productKey === "relief-oil").rationale);

  assertClassPure(stale, "conditional", "stale CrownState");
  assertClassPure(refreshed, "strong", "refreshed CrownState");
  assert.ok(
    refreshed.explanation.includes("tender scalp"),
    "the refreshed card must reason from the CrownState it was actually given",
  );
  assert.equal(
    refreshed.explanation.includes("comfortable scalp"),
    false,
    "the refreshed card must not carry the previous CrownState's wording",
  );

  // And the same guarantee on the local Core path, where the class moves because
  // the CrownPrint itself changed rather than because the Lab said so.
  const localCases = [
    ["strong", profile("P3-D2-T2-S2-E1", { concern: "breakage", goal: "repair" })],
    ["good", profile("P3-E1", { concern: "breakage", goal: "repair" })],
    ["conditional", profile("P2-D2-T1-S2-E2", {})],
  ];
  const localSeen = [];
  for (const [expected, p] of localCases) {
    const match = localGuidance(p).matches.find((m) => m.productKey === "revaivl-protein-conditioner");
    assert.ok(match, `the fixture for a ${expected} local match must actually produce one`);
    assert.equal(match.matchClass, expected, "fixture drift: this profile no longer produces that class");
    assertClassPure(match.rationale, expected, `local ${expected}`);
    localSeen.push(match.rationale.explanation);
  }
  assert.equal(new Set(localSeen).size, 3, "the same product must explain each class differently on the local path");
});
