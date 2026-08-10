// Shop by CrownPrint™ — Wynn's own catalog-fit engine.
//
// WHAT THIS DOES
// Takes a CrownPrint Core (read off the shopper's CrownPrint code) plus the
// CrownState they told us on the page, and works out which Wynn Essentials
// products fit what their hair needs right now. Deterministic: the same profile
// always produces the same matches, in the same order, with the same reasons.
//
// WHERE THE BOUNDARY IS
// Hair Wellness Lab owns the CrownPrint assessment, the Intelligence Report, the
// evidence architecture, and the Wynn Essentials Match™ engine. NONE of that is
// reproduced here. This file reasons about ONE thing HWL cannot: the Wynn
// Essentials catalog. Every rule below maps a CrownPrint signal the shopper
// already has onto a product Wynn already sells, and every `why` is a statement
// about FIT — not a new efficacy claim, not a diagnosis, and never a claim about
// what a product does beyond its own catalog copy.
//
// The live HWL integration (lib/crownprint.ts) is still the richer path and
// still takes precedence when it is connected; this is what makes the page work
// for a shopper holding nothing but their code.
//
// Dependency-free TypeScript so it is directly unit-testable — see
// tests/crownprint-fit.test.mjs.

import type { CoreAxisId, CrownPrintProfile, StateFieldId } from "./crownprint-code";
import { CORE_AXES, STATE_FIELDS, labelForState, missingCoreAxes } from "./crownprint-code";
import {
  buildRationale,
  coreSignal,
  dedupeSignals,
  stateSignal,
  type GuidanceSource,
  type MatchClass,
  type MatchRationale,
  type MatchSignal,
} from "./crownprint-match-intelligence";

export type { MatchClass, MatchRationale };

export type FitMatch = {
  productKey: string;
  productName: string;
  matchClass: MatchClass;
  /** Why this product fits THIS CrownPrint. */
  why: string;
  /** Which CrownPrint need it serves — the routine role, in one phrase. */
  need: string;
  /** When and how often to use it, tuned to this profile where that matters. */
  whenToUse: string;
  /** Honest limits — shown on the card, never hidden to make a match look better. */
  caution?: string;
  /**
   * Core axes this product's guidance depends on that the code didn't include.
   * Present only for a partial CrownPrint, and always surfaced rather than
   * quietly absorbed — it is why this match cannot be called strong.
   */
  limitedBy?: string[];
  /** The few ingredients from this product's own list that carry the fit. */
  keyIngredients: string[];
  methodStep: number;
  /**
   * The customer-facing Match Intelligence for this card: which of the shopper's
   * own signals produced this classification, the function they point at, and —
   * for a Conditional Match — the condition, when it applies, and when it does
   * not. Built from the rules that actually fired, never from the class alone.
   */
  rationale: MatchRationale;
  /** Internal ordering only; never rendered (see docs: no scores to shoppers). */
  score: number;
};

/**
 * Brand-agnostic guidance for the honest-fit outcome: what this CrownPrint
 * actually needs, and what to look for on any label — including labels that
 * aren't ours. Shown when nothing in the collection fits, and alongside the
 * results when nothing rises to a strong fit.
 */
export type WhatToLookFor = {
  hairNeed: string;
  productType: string;
  formulationCharacteristics: string[];
  ingredientFunctions: string[];
  whatMayNotFit: string[];
  whyThisMatters: string;
};

/** One entry in "your current priorities" / "product functions you need". */
export type LabelledPoint = { label: string; detail: string };

export type FitResult = {
  priorityLabel: string;
  /** Ranked, like the Intelligence Report frames them: scalp, moisture, strength… */
  priorities: LabelledPoint[];
  /** The routine FUNCTIONS this CrownPrint needs, product-agnostic. */
  functions: LabelledPoint[];
  matches: FitMatch[];
  /** Functions this CrownPrint needs that the Wynn catalog does not cover. */
  gaps: LabelledPoint[];
  /** Profile-level notes that belong next to the results, not on one card. */
  notes: string[];
  noStrongMatch: boolean;
  /** True when the catalog has nothing for this CrownPrint at all. */
  noFit: boolean;
  whatToLookFor: WhatToLookFor;
  /** Core axes the code didn't include, named so they can be asked for. */
  missingAxes: { id: CoreAxisId; letter: string; label: string }[];
  /** "full" only for a complete P-D-T-S-E code. Never implied, always earned. */
  confidence: "full" | "reduced";
};

/** The catalog fields the engine needs. Anything shaped like this works. */
export type FitCatalogProduct = { slug: string; name: string; methodStep: number; kind?: string };

type Rule = { when: (p: CrownPrintProfile) => boolean; points: number; why?: string };
type ProductRules = {
  rules: Rule[];
  /** The CrownPrint need this product serves — its role in a routine. */
  need: string;
  /** Default usage cadence, from the product's own directions in app/data.ts. */
  when: string;
  /** Cadence rewritten for the profiles where the default would be wrong. */
  whenOverrides?: { when: (p: CrownPrintProfile) => boolean; text: string }[];
  cautions?: { when: (p: CrownPrintProfile) => boolean; text: string }[];
  /**
   * A handful of ingredients lifted VERBATIM from this product's own list in
   * app/data.ts — the ones that carry the fit being described. Naming what is
   * already on the label is not a new claim; it is the shopper's own ingredient
   * list, surfaced where the decision is made.
   */
  keyIngredients: string[];
};

// ---------------------------------------------------------------------------
// Signal helpers. `core` values come from the code; `state` from the page.
// ---------------------------------------------------------------------------
const PROTECTIVE_STYLES = new Set(["braids", "locs", "twists", "wig"]);

const por = (p: CrownPrintProfile, v: string) => p.core.porosity === v;
const den = (p: CrownPrintProfile, v: string) => p.core.density === v;
const thk = (p: CrownPrintProfile, v: string) => p.core.thickness === v;
const scalpType = (p: CrownPrintProfile, ...v: string[]) => v.includes(p.core.scalp ?? "");
const ela = (p: CrownPrintProfile, v: string) => p.core.elasticity === v;
const concern = (p: CrownPrintProfile, v: string) => p.state.concern === v;
const goal = (p: CrownPrintProfile, v: string) => p.state.goal === v;
const stage = (p: CrownPrintProfile, ...v: string[]) => v.includes(p.state.stage ?? "");
const scalpNow = (p: CrownPrintProfile, ...v: string[]) => v.includes(p.state.scalpNow ?? "");
const inProtective = (p: CrownPrintProfile) =>
  PROTECTIVE_STYLES.has(p.state.style ?? "") || goal(p, "protective") || stage(p, "fresh", "mid", "takedown-soon");
const scalpUnsettled = (p: CrownPrintProfile) =>
  scalpNow(p, "tender", "itchy", "flaky") || concern(p, "scalp") || scalpType(p, "dry", "sensitive");
const tensionRisk = (p: CrownPrintProfile) =>
  concern(p, "breakage") || concern(p, "shedding") || den(p, "low") || thk(p, "fine") || ela(p, "low");

// ---------------------------------------------------------------------------
// Which Core axes a product's guidance actually depends on.
//
// A partial CrownPrint code must never be treated like a complete one. The
// honest way to do that is to know, per product, which axes its reasoning
// consults — then say so and hold its confidence down when one of them is
// missing. Nothing is ever guessed at to fill the hole.
//
// The dependency set is discovered by running each predicate against a probe
// profile whose every field reads as a value that matches nothing. Because no
// comparison succeeds, `||` chains evaluate all the way through and every axis
// the predicate could consult is recorded. That keeps the annotation in step
// with the rules automatically — a rule can never drift out of sync with a
// hand-maintained list of the axes it reads.
// ---------------------------------------------------------------------------
const NEVER = " never";
const CORE_AXIS_IDS = new Set<string>(CORE_AXES.map((a) => a.id));

function axesConsultedBy(predicates: ((p: CrownPrintProfile) => boolean)[]): CoreAxisId[] {
  const used = new Set<CoreAxisId>();
  const core = new Proxy({}, {
    get(_t, key) {
      if (typeof key === "string" && CORE_AXIS_IDS.has(key)) used.add(key as CoreAxisId);
      return NEVER;
    },
  }) as CrownPrintProfile["core"];
  const state = new Proxy({}, { get: () => NEVER }) as CrownPrintProfile["state"];
  for (const predicate of predicates) {
    try { predicate({ core, state }); } catch { /* a probe throw is not a dependency */ }
  }
  return [...used];
}

/**
 * Whether a statement is only true BECAUSE an axis is missing.
 *
 * This is the difference between a caution we may show and one we may not. A
 * caution that fires on signals we actually have — "breakage plus low density
 * means watch the tension at your hairline" — stays true whatever the unknown
 * axes turn out to be, so it is honest. A caution that fires because a check
 * came back empty — "your CrownPrint doesn't flag a strength problem", when
 * elasticity was never given — would flip the moment the shopper filled that
 * axis in. That one is an inference dressed as an observation, and it is
 * suppressed.
 *
 * Decided by substitution rather than by reading the rule: every combination of
 * levels for the missing axes is tried, and if any of them changes the answer,
 * the statement is contingent on something we were not told.
 */
function isContingentOnMissing(
  predicate: (p: CrownPrintProfile) => boolean,
  profile: CrownPrintProfile,
  missing: { id: CoreAxisId; levels: { value: string }[] }[],
): boolean {
  if (!missing.length) return false;
  const actual = predicate(profile);
  let combos: string[][] = [[]];
  for (const axis of missing) {
    combos = combos.flatMap((combo) => axis.levels.map((l) => [...combo, l.value]));
    if (combos.length > 512) break; // guard; the real space is a few hundred at most
  }
  for (const combo of combos) {
    const core = { ...profile.core };
    missing.forEach((axis, i) => { if (combo[i]) core[axis.id] = combo[i]; });
    if (predicate({ core, state: profile.state }) !== actual) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Which of the shopper's OWN signals made a rule fire.
//
// The card has to name the evidence, not the answer sheet. "You said dryness" is
// a restatement; "dryness as the main thing you're dealing with right now points
// at moisture retention, and Uplyft is the step that performs it" is a reason.
// To write the second sentence honestly we need to know which signals actually
// carried the rule, which is decided by substitution rather than by reading it:
//
//   • drop one signal — if the rule stops firing, that signal was necessary;
//   • keep only that signal — if the rule still fires, it was sufficient on its own.
//
// Either makes it a contributor. An `||` chain where two signals are both true
// reports both (neither is necessary, both are sufficient), which is exactly what
// a shopper should be told. Nothing is hand-annotated, so a rule can never drift
// out of step with the reasons printed underneath it.
// ---------------------------------------------------------------------------
const STATE_FIELD_IDS: StateFieldId[] = STATE_FIELDS.map((f) => f.id);
const CORE_AXIS_ORDER: CoreAxisId[] = CORE_AXES.map((a) => a.id);

const fires = (predicate: (p: CrownPrintProfile) => boolean, profile: CrownPrintProfile): boolean => {
  try { return predicate(profile); } catch { return false; }
};

function contributingSignals(
  predicate: (p: CrownPrintProfile) => boolean,
  profile: CrownPrintProfile,
): MatchSignal[] {
  if (!fires(predicate, profile)) return [];
  const out: MatchSignal[] = [];

  for (const id of CORE_AXIS_ORDER) {
    const value = profile.core[id];
    if (!value) continue;
    const without = { core: { ...profile.core, [id]: undefined }, state: profile.state };
    const only = { core: { [id]: value }, state: {} };
    if (!fires(predicate, without) || fires(predicate, only)) out.push(coreSignal(id, value)!);
  }
  for (const id of STATE_FIELD_IDS) {
    const value = profile.state[id];
    if (!value) continue;
    const without = { core: profile.core, state: { ...profile.state, [id]: undefined } };
    const only = { core: {}, state: { [id]: value } };
    if (!fires(predicate, without) || fires(predicate, only)) out.push(stateSignal(id, value)!);
  }
  return out.filter(Boolean);
}

// Static per product, so it is computed once.
const dependencyCache = new Map<string, CoreAxisId[]>();
function axesProductDependsOn(slug: string, spec: ProductRules): CoreAxisId[] {
  const cached = dependencyCache.get(slug);
  if (cached) return cached;
  const predicates = [
    ...spec.rules.map((r) => r.when),
    ...(spec.cautions ?? []).map((c) => c.when),
    ...(spec.whenOverrides ?? []).map((o) => o.when),
  ];
  const axes = axesConsultedBy(predicates);
  dependencyCache.set(slug, axes);
  return axes;
}

// ---------------------------------------------------------------------------
// The rules. Each product states, in shopper-facing language, WHY a CrownPrint
// signal points at it. Reasons are ranked by weight and the top two are shown.
// ---------------------------------------------------------------------------
const RULES: Record<string, ProductRules> = {
  "lathyr-shampoo": {
    need: "A clean, balanced starting point",
    when: "Every 7–10 days. Saturate first, massage the scalp rather than the lengths, and always follow with a conditioner.",
    whenOverrides: [{ when: (p) => scalpNow(p, "oily") || scalpType(p, "oily"), text: "Every 5–7 days while your scalp is running oily, then stretch it back out." },
      { when: (p) => stage(p, "post-takedown"), text: "First thing after takedown — cleanse, then detangle, then deep condition. In that order." },
      { when: (p) => inProtective(p), text: "Every 1–2 weeks while you're styled, worked into the scalp between rows and rinsed thoroughly." }],
    keyIngredients: ["Decyl glucoside", "Cocamidopropyl betaine", "Aloe vera juice"],
    rules: [
      { when: (p) => concern(p, "buildup"), points: 5, why: "Buildup is what you're dealing with right now, and a sulfate-free cleanse lifts residue without stripping the moisture underneath it." },
      { when: (p) => stage(p, "post-takedown"), points: 5, why: "Right after takedown, a thorough but gentle cleanse clears everything that collected under the style before you re-moisturize." },
      { when: (p) => scalpNow(p, "oily") || scalpType(p, "oily"), points: 4, why: "An oily, weighed-down scalp resets on wash day — this cleanses without pushing it to overcompensate." },
      { when: (p) => stage(p, "takedown-soon"), points: 3, why: "Takedown is close, and a non-stripping cleanse is the first step of the recovery routine that follows it." },
      { when: (p) => den(p, "high"), points: 2, why: "High density means product can sit in the layers where you can't see it — a careful, sectioned cleanse keeps it from accumulating." },
      { when: (p) => por(p, "low"), points: 2, why: "Low-porosity hair holds residue right at the cuticle, which is exactly where it blocks the moisture you're adding." },
      { when: (p) => scalpUnsettled(p), points: 2, why: "Sulfate-free, so a dry or easily irritated scalp isn't stripped on wash day." },
      { when: (p) => inProtective(p), points: 1 },
    ],
  },

  "uplyft-conditioner": {
    need: "Moisture retention",
    when: "Every wash day, or 1–2 times a week. Apply to damp hair, cover for 20 minutes, then rinse.",
    whenOverrides: [{ when: (p) => por(p, "low"), text: "Every wash day, with warmth — a cap plus a warm towel or low dryer heat. Low porosity opens with heat, not with heavier product." },
      { when: (p) => thk(p, "coarse"), text: "Every wash day, and give it the full 20 minutes — coarse strands need the contact time to take anything in." }],
    keyIngredients: ["Behentrimonium methosulfate", "Honey", "Black castor oil"],
    rules: [
      { when: (p) => concern(p, "dryness"), points: 5, why: "Dryness is your primary concern, and wash-day conditioning is where the moisture actually goes in." },
      { when: (p) => por(p, "high"), points: 4, why: "High-porosity strands lose water as quickly as they take it in, so wash day has to put real moisture back." },
      { when: (p) => thk(p, "coarse"), points: 3, why: "Coarse strands want richer moisture and more time to absorb it — this is a cover-and-wait deep conditioner." },
      { when: (p) => stage(p, "post-takedown", "takedown-soon"), points: 3, why: "A thorough detangle and a moisture treatment is the recovery step between one protective style and the next." },
      { when: (p) => ela(p, "low"), points: 2, why: "Low elasticity needs moisture alongside protein — never protein on its own." },
      { when: (p) => por(p, "low"), points: 2, why: "Low-porosity hair responds to warmth and longer contact rather than to heavier product, which is how this one is meant to be used." },
      { when: (p) => goal(p, "repair"), points: 2 },
    ],
    cautions: [
      { when: (p) => por(p, "low") && thk(p, "fine"), text: "Fine, low-porosity strands can feel weighed down by a rich conditioner — use warmth, focus on mid-lengths and ends, and rinse thoroughly." },
    ],
  },

  "revaivl-protein-conditioner": {
    need: "Strength and elasticity",
    when: "Once or twice a month — never back-to-back with another protein step, and always followed by a moisturizing conditioner.",
    whenOverrides: [{ when: (p) => ela(p, "low") || concern(p, "breakage"), text: "Every other week while you're rebuilding strength, then back to once a month. Follow every use with Uplyft." },
      { when: (p) => ela(p, "high"), text: "Rarely — once every month or two at most. Your elasticity is already good, and more protein than that works against you." }],
    keyIngredients: ["Rice protein", "Panthenol", "Flax seed oil"],
    rules: [
      { when: (p) => ela(p, "low"), points: 6, why: "Low elasticity — strands that stretch and snap instead of springing back — is the clearest signal in your Core for protein." },
      { when: (p) => concern(p, "breakage"), points: 5, why: "Breakage is your primary concern, and this is the strength step of the routine." },
      { when: (p) => stage(p, "post-takedown"), points: 3, why: "After takedown, a moisture and — if needed — protein treatment is what gets your hair ready for the next style." },
      { when: (p) => goal(p, "repair"), points: 3 },
      { when: (p) => por(p, "high"), points: 3, why: "Higher-porosity behavior often comes with a cuticle that benefits from occasional protein." },
      { when: (p) => concern(p, "shedding"), points: 2 },
      { when: (p) => thk(p, "fine"), points: 2, why: "Fine strands have less to give before they break, so periodic strengthening matters more." },
      { when: (p) => ela(p, "high"), points: -2 },
    ],
    cautions: [
      { when: (p) => !ela(p, "low") && !concern(p, "breakage"), text: "Your CrownPrint doesn't flag a strength problem, so keep protein occasional — once or twice a month alongside your regular moisture." },
    ],
  },

  "hydrate-herbal-hair-mist": {
    need: "Day-to-day moisture between wash days",
    when: "Daily or every other day on dry or damp hair, focused on the areas that feel tight — then seal with Nourish.",
    whenOverrides: [{ when: (p) => inProtective(p), text: "Every one to two days, misting the scalp between rows and the exposed lengths. This is your main moisture step while you are styled." },
      { when: (p) => thk(p, "fine") || den(p, "low"), text: "Daily, lightly — a few passes rather than a soaking, so fine hair does not go flat." }],
    keyIngredients: ["Organic aloe vera leaf juice", "Panthenol", "Vegetable glycerin"],
    rules: [
      { when: (p) => concern(p, "dryness"), points: 5, why: "Dryness is your primary concern, and this is the between-wash-day layer that keeps addressing it." },
      { when: (p) => inProtective(p), points: 4, why: "Inside braids, locs, twists, or under a wig, a mist is what actually reaches your scalp and lengths — creams can't get there." },
      { when: (p) => den(p, "high"), points: 3, why: "High density makes it hard for product to reach every layer; a mist distributes where a cream would sit on top." },
      { when: (p) => thk(p, "fine") || por(p, "low"), points: 3, why: "Light, water-based moisture layers onto fine or low-porosity hair without weighing it down." },
      { when: (p) => scalpUnsettled(p), points: 2, why: "Light moisture on a dry or uncomfortable scalp between washes, without a heavy application." },
      { when: (p) => goal(p, "protective"), points: 2 },
      { when: (p) => por(p, "medium"), points: 1, why: "Balanced porosity stays balanced on a steady hydrate-and-seal rhythm — this is the hydrate half." },
    ],
  },

  "nourish-oil": {
    need: "Sealing in the moisture you just added",
    when: "2–4 times a week, on damp hair right after Hydrate. Warm a few drops between your palms first.",
    whenOverrides: [{ when: (p) => thk(p, "fine") && por(p, "low"), text: "Two or three drops, mid-lengths and ends only, once or twice a week. Skip the scalp." },
      { when: (p) => por(p, "high") || thk(p, "coarse"), text: "Every time you hydrate — for high-porosity or coarse strands, the seal is what makes the moisture step count." }],
    keyIngredients: ["Shea butter", "Coconut oil", "Organic jojoba seed oil"],
    rules: [
      { when: (p) => por(p, "high"), points: 5, why: "High-porosity hair lets moisture go as fast as it takes it in — sealing after you hydrate is what keeps it there." },
      { when: (p) => concern(p, "dryness"), points: 4, why: "Dryness is your primary concern, and sealing is the step most routines skip." },
      { when: (p) => thk(p, "coarse"), points: 3, why: "Coarse strands can carry — and tend to want — a richer seal than finer hair does." },
      { when: (p) => concern(p, "frizz"), points: 3, why: "Sealing the cuticle after moisture is what keeps frizz from setting in as hair dries." },
      { when: (p) => por(p, "medium"), points: 2, why: "A consistent hydrate-and-seal rhythm is what keeps balanced porosity balanced — this is the seal half." },
      { when: (p) => stage(p, "post-takedown"), points: 2 },
    ],
    cautions: [
      { when: (p) => thk(p, "fine") && por(p, "low"), text: "Fine, low-porosity strands go limp under heavy oil — two or three drops on mid-lengths and ends is plenty, and skip the scalp." },
    ],
  },

  "grow-oil": {
    need: "Scalp support and length retention",
    when: "2–3 times a week on a clean or refreshed scalp. Part in sections and massage for 1–2 minutes.",
    whenOverrides: [{ when: (p) => scalpNow(p, "oily"), text: "Once a week at most while your scalp is oily — along the parts only, ideally right after a wash." }],
    keyIngredients: ["Rosemary oil", "Black seed oil", "Jamaican black castor oil"],
    rules: [
      { when: (p) => goal(p, "growth"), points: 6, why: "Length retention is your current goal, and scalp-focused care is where that work happens." },
      { when: (p) => concern(p, "shedding"), points: 5, why: "Shedding and thinning are what you're noticing, and this is the scalp step of the routine." },
      { when: (p) => den(p, "low"), points: 4, why: "With lower density, every strand counts — supporting the follicles you have is the highest-leverage move." },
      { when: (p) => inProtective(p), points: 3, why: "A dropper reaches the scalp between rows and parts, which is where scalp care has to land while you're styled." },
      { when: (p) => concern(p, "scalp"), points: 2 },
      { when: (p) => scalpNow(p, "oily"), points: -2 },
    ],
    cautions: [
      { when: (p) => scalpNow(p, "oily") || scalpType(p, "oily"), text: "Your scalp reads oily right now — apply sparingly along the parts only, or start after your next cleanse." },
    ],
  },

  "relief-oil": {
    need: "Scalp comfort",
    when: "1–3 times a week, or as needed, on the areas that feel dry, itchy, or tender. Do not rinse.",
    whenOverrides: [{ when: (p) => inProtective(p), text: "As needed while you are styled — apply directly along the parts with the dropper, no heavy application." }],
    keyIngredients: ["Tea tree oil", "Virgin black cumin seed oil", "Brazilian babassu oil"],
    rules: [
      { when: (p) => scalpNow(p, "itchy", "flaky"), points: 6, why: "Your CrownState says your scalp is itchy or flaking this week — that's the exact need this one is formulated around." },
      { when: (p) => scalpNow(p, "tender"), points: 6, why: "You reported a tender scalp right now, and soothing it is the first thing to address." },
      { when: (p) => scalpType(p, "dry"), points: 5, why: "A dry scalp type is a standing need, not a one-week problem — this targets it directly." },
      { when: (p) => scalpType(p, "sensitive"), points: 5, why: "A scalp that reacts easily does better with a targeted, gentle oil than with heavy all-over product." },
      { when: (p) => concern(p, "scalp"), points: 5, why: "Scalp discomfort is your primary concern, and healthy hair grows from a comfortable scalp." },
      { when: (p) => inProtective(p), points: 3, why: "Braids, locs, and wigs make the scalp the hardest place to reach — a dropper gets underneath the style." },
      { when: (p) => stage(p, "mid", "takedown-soon"), points: 2 },
    ],
  },

  "thairap-moisture-styling-cream": {
    need: "Definition with moisture in one step",
    when: "On damp hair when you style — after Hydrate, before you seal. Work through in sections, then leave it alone to dry.",
    whenOverrides: [{ when: (p) => thk(p, "fine") && por(p, "low"), text: "A small amount on damp hair, emulsified in your palms first. Add more only if you need it — you rarely will." }],
    keyIngredients: ["Shea butter", "Castor seed oil", "Rice bran oil"],
    rules: [
      { when: (p) => concern(p, "definition"), points: 6, why: "Definition is your primary concern, and this is the styling step that creates it." },
      { when: (p) => concern(p, "frizz"), points: 4, why: "A moisture cream smooths and defines in one step, which is usually where frizz gets addressed." },
      { when: (p) => p.state.style === "natural", points: 4, why: "You're wearing your hair loose right now, which is exactly where a styling cream does its work." },
      { when: (p) => goal(p, "definition"), points: 3 },
      { when: (p) => thk(p, "coarse"), points: 3, why: "Richer creams suit coarse strands, giving them the slip and moisture they need to clump." },
      { when: (p) => concern(p, "dryness"), points: 2, why: "It moisturizes while it styles, so a dry day doesn't force a choice between the two." },
      { when: (p) => PROTECTIVE_STYLES.has(p.state.style ?? ""), points: -2 },
    ],
    cautions: [
      { when: (p) => PROTECTIVE_STYLES.has(p.state.style ?? ""), text: "You're in a protective style right now — this one comes into its own on your next wash-and-go, twist-out, or braid-out." },
      { when: (p) => thk(p, "fine") && por(p, "low"), text: "Fine, low-porosity hair is easy to overload — start with a small amount and add only if you need it." },
    ],
  },

  "edge-control": {
    need: "A finished hairline",
    when: "Up to 2–4 times a week on clean, moisturized edges — never daily, and never on edges that feel sore.",
    keyIngredients: ["Hydrolyzed silk", "Olive fruit oil", "Aloe vera leaf juice"],
    rules: [
      { when: (p) => PROTECTIVE_STYLES.has(p.state.style ?? ""), points: 3, why: "A styled hairline is usually part of the look while you're in braids, locs, twists, or a wig." },
      { when: (p) => concern(p, "definition") || goal(p, "definition"), points: 3, why: "Definition is what you're working on, and the hairline is where a style reads as finished." },
      { when: (p) => p.state.style === "silkpress", points: 2 },
    ],
    cautions: [
      { when: (p) => tensionRisk(p), text: "Your CrownPrint points to tension risk at the hairline — keep edge styling light and occasional, skip daily brushing, and never style edges that feel sore." },
    ],
  },

  "soft-life-bonnet": {
    need: "Overnight protection",
    when: "Every night. This is the cheapest, highest-return habit in any routine.",
    keyIngredients: [],
    rules: [
      { when: (p) => concern(p, "dryness"), points: 3, why: "A lot of the moisture you add overnight is lost to friction — covering keeps what you put in." },
      { when: (p) => concern(p, "breakage"), points: 3, why: "Overnight friction is one of the quietest sources of breakage, and the easiest to remove." },
      { when: (p) => inProtective(p), points: 3, why: "Covering at night is what keeps a protective style looking fresh for the length of the wear." },
      { when: (p) => concern(p, "frizz"), points: 2, why: "Less friction overnight means less frizz to fix in the morning." },
      { when: (p) => thk(p, "fine"), points: 2, why: "Fine strands have the least tolerance for nightly friction." },
    ],
  },

  "heritage-hold-scrunchie-set": {
    need: "Low-tension styling",
    when: "Any time you would reach for a standard elastic — and never tight enough to feel it at the hairline.",
    keyIngredients: [],
    rules: [
      { when: (p) => concern(p, "breakage"), points: 4, why: "The elastic line is a classic breakage point — satin creases and pulls far less than a standard band." },
      { when: (p) => concern(p, "shedding"), points: 3, why: "Tension at the tie is worth removing while you're already watching shedding." },
      { when: (p) => thk(p, "fine") || den(p, "low"), points: 2, why: "Fine or lower-density hair shows tension damage soonest, so gentler ties matter more." },
      { when: (p) => p.state.style === "natural" || p.state.style === "silkpress", points: 2 },
    ],
  },
};

// The four-step system. Handled after scoring: it is a match when the CrownPrint
// points at the steps it contains, not on rules of its own.
const BUNDLE_SLUG = "hair-wellness-bundle";
const BUNDLE_MEMBERS = ["lathyr-shampoo", "uplyft-conditioner", "hydrate-herbal-hair-mist", "nourish-oil"];

// Thresholds are deliberately high. "Strong" has to mean something, so most
// profiles land two or three products there — not the whole catalog.
const STRONG_AT = 10;
const GOOD_AT = 5;

const classify = (score: number): MatchClass | null =>
  score >= STRONG_AT ? "strong" : score >= GOOD_AT ? "good" : score >= 1 ? "conditional" : null;

const CLASS_ORDER: Record<MatchClass, number> = { strong: 0, good: 1, conditional: 2 };

// ---------------------------------------------------------------------------
// REMOVED (HWL contract hardening): matchFunctionsToCatalog / CATALOG_CAPABILITIES.
//
// This block used to map a resolved product-function LABEL onto Wynn product
// slugs with a table of regexes, and lib/crownprint-guidance.ts turned every hit
// into a product card. That made a description of a need into a recommendation,
// and it was wrong in both directions:
//
//   · "Strength & Protein Support" is a function label. It contains no
//     instruction to render a cleanser, yet a coverage row mentioning
//     `cleanse_scalp` pulled Lathyr onto the page via /cleans|wash/.
//   · `reduce_surface_friction` pulled the Soft Life Bonnet in via /friction/ —
//     an accessory conjured out of formulation coverage, which is exactly the
//     confusion the separate accessory channel exists to prevent.
//
// The Hair Wellness Lab decides which products a CrownPrint resolves to. That
// decision arrives in `matches`, and `matches` is now the ONLY thing Wynn will
// render a CrownPrint product card from. Coverage explains what Wynn could and
// could not serve; it names no products, because a boundary normalizer drops
// every product field before coverage reaches this layer.
//
// Do not reintroduce a label-to-product table here. If a function should yield
// a product, that belongs in HWL's matches array, where it can be classified,
// explained, and audited.
// ---------------------------------------------------------------------------

/**
 * The routine role and usage cadence for one product, independent of any
 * profile. This is Wynn's own catalog knowledge, so the HWL-connected page can
 * show "what need it serves" and "when to use it" on matches that came from the
 * Hair Wellness Lab — which sends neither, and shouldn't have to.
 */
export function productUsage(slug: string): { need: string; whenToUse: string } | null {
  if (slug === BUNDLE_SLUG) {
    return {
      need: "The full four-step routine",
      whenToUse:
        "Cleanse with Lathyr every 7–10 days, deep condition with Uplyft on wash day, refresh with Hydrate between washes, and seal with Nourish 2–4 times a week.",
    };
  }
  const spec = RULES[slug];
  return spec ? { need: spec.need, whenToUse: spec.when } : null;
}

/**
 * The one consumer-safe priority line shown above the matches. Mirrors how the
 * CrownPrint Intelligence Report frames priorities (scalp comfort before
 * moisture before strength), but it is a label for the results — not a
 * reproduction of HWL's ranked priority analysis.
 */
export function priorityLabel(profile: CrownPrintProfile): string {
  const base = scalpUnsettled(profile)
    ? "Scalp comfort"
    : concern(profile, "dryness") || por(profile, "high")
      ? "Moisture retention"
      : concern(profile, "breakage") || ela(profile, "low")
        ? "Strength and breakage reduction"
        : concern(profile, "shedding") || goal(profile, "growth")
          ? "Scalp health and length retention"
          : concern(profile, "buildup")
            ? "A clean, balanced reset"
            : concern(profile, "definition") || concern(profile, "frizz") || goal(profile, "definition")
              ? "Definition and frizz control"
              : "A consistent, repeatable routine";

  const qualifier = stage(profile, "post-takedown")
    ? " after takedown"
    : PROTECTIVE_STYLES.has(profile.state.style ?? "")
      ? ` while you're in ${labelForState("style", profile.state.style)?.toLowerCase()}`
      : "";
  return `${base}${qualifier}`;
}

/**
 * Rank the Wynn Essentials catalog against a CrownPrint profile.
 *
 * Braiding hair is excluded: it is an install material, not a fit decision about
 * someone's hair. Everything else scores, and anything scoring nothing is left
 * out rather than padded in — a short honest list beats a long flattering one.
 */
export function matchProducts(profile: CrownPrintProfile, catalog: FitCatalogProduct[]): FitResult {
  const scored = new Map<string, FitMatch>();
  // Kept so the bundle can explain itself from the same signals its member
  // products were matched on, rather than inventing a reason of its own.
  const signalsBySlug = new Map<string, MatchSignal[]>();

  // Axes this CrownPrint does not include. A partial code is honoured for what
  // it says and never extended past it.
  const missing = missingCoreAxes(profile.core);
  // How much context this whole result was produced from. Mirrors the labelling
  // in lib/crownprint-guidance.ts, so a card can never claim more certainty than
  // the page it sits on.
  const source: GuidanceSource = !Object.keys(profile.core).length
    ? "crownstate-only"
    : missing.length
      ? "core-partial"
      : "core";
  const missingIds = new Set<CoreAxisId>(missing.map((a) => a.id));
  const axisLabel = (id: CoreAxisId) => CORE_AXES.find((a) => a.id === id)?.label ?? id;
  // A statement may only be made if it would survive learning the axes we lack.
  const unsafeToState = (predicate: (p: CrownPrintProfile) => boolean) =>
    isContingentOnMissing(predicate, profile, missing);

  for (const product of catalog) {
    if (product.kind === "hair" || product.slug === BUNDLE_SLUG) continue;
    const spec = RULES[product.slug];
    if (!spec) continue;

    // What this product's guidance leans on that we weren't given.
    const blindTo = axesProductDependsOn(product.slug, spec).filter((a) => missingIds.has(a));

    // No baseline weight: a product's score comes entirely from the CrownPrint
    // signals that point at it. Free points would let the same routine surface
    // for everyone and call it personalization.
    let score = 0;
    let signals = 0;
    const reasons: { points: number; why: string }[] = [];
    const fired: Rule[] = [];
    for (const rule of spec.rules) {
      if (!rule.when(profile)) continue;
      score += rule.points;
      if (rule.points > 0) { signals++; fired.push(rule); }
      if (rule.why) reasons.push({ points: rule.points, why: rule.why });
    }

    // A product must be pointed at by something in THIS CrownPrint. Base weight
    // alone is never a match — otherwise every shopper sees the same routine
    // dressed up as personalization, and "no fit" could never be told honestly.
    let matchClass = signals > 0 ? classify(score) : null;
    if (!matchClass) continue;

    // A partial code cannot produce a strong match on a product whose reasoning
    // depends on an axis we don't have. We are not less sure this is right — we
    // are less sure we've seen everything that bears on it, and that is a real
    // difference the shopper is entitled to.
    if (blindTo.length && matchClass === "strong") matchClass = "good";

    // The two strongest reasons. A product carried by unworded rules falls back
    // to its routine role, so a card never renders an empty explanation.
    const why = reasons
      .sort((a, b) => b.points - a.points)
      .slice(0, 2)
      .map((r) => r.why)
      .join(" ") || "A dependable part of a consistent routine for your CrownPrint.";

    // A caution whose truth turns on an axis we weren't given is an inference,
    // not an observation — "your CrownPrint doesn't flag a strength problem"
    // when elasticity is missing. Suppressed. A caution that holds regardless of
    // what those axes turn out to be is real, and is kept.
    const caution = spec.cautions?.find((c) => c.when(profile) && !unsafeToState(c.when))?.text;
    const whenToUse = spec.whenOverrides?.find((o) => o.when(profile) && !unsafeToState(o.when))?.text ?? spec.when;

    // The signals that carried this match, strongest rule first. This is the
    // shopper-specific evidence the card's classification explanation rests on.
    const matchSignals = dedupeSignals(
      [...fired]
        .sort((a, b) => b.points - a.points)
        .flatMap((rule) => contributingSignals(rule.when, profile)),
    );
    signalsBySlug.set(product.slug, matchSignals);

    scored.set(product.slug, {
      productKey: product.slug,
      productName: product.name,
      matchClass,
      why,
      need: spec.need,
      whenToUse,
      ...(caution ? { caution } : {}),
      ...(blindTo.length ? { limitedBy: blindTo.map(axisLabel) } : {}),
      keyIngredients: spec.keyIngredients,
      methodStep: product.methodStep,
      rationale: buildRationale({
        matchClass,
        productName: product.name,
        functionServed: spec.need,
        signals: matchSignals,
        productReason: why,
        whenToUse,
        ...(caution ? { caution } : {}),
        ...(blindTo.length ? { limitedBy: blindTo.map(axisLabel) } : {}),
        source,
      }),
      score,
    });
  }

  // The bundle stands in for the four core steps when the CrownPrint points at
  // most of them — it is the same products, so it never competes with a stronger
  // single-product answer.
  const bundle = catalog.find((p) => p.slug === BUNDLE_SLUG);
  if (bundle) {
    const members = BUNDLE_MEMBERS.map((slug) => scored.get(slug)).filter((m): m is FitMatch => Boolean(m));
    const carrying = members.filter((m) => m.matchClass !== "conditional");
    if (carrying.length >= 3) {
      const allStrong = members.length === BUNDLE_MEMBERS.length && members.every((m) => m.matchClass === "strong");
      const bundleClass: MatchClass = allStrong ? "strong" : "good";
      const bundleNeed = "The full four-step routine";
      const bundleWhen =
        "Cleanse with Lathyr every 7–10 days, deep condition with Uplyft on wash day, refresh with Hydrate between washes, and seal with Nourish 2–4 times a week.";
      const bundleWhy = `Your CrownPrint points at ${carrying.length === 4 ? "all four" : "most"} of the core steps — cleanse, condition, hydrate, and seal. This is those four together as one routine.`;
      // The bundle explains itself from the signals that carried the individual
      // steps inside it — it is those products, so it borrows their evidence
      // rather than manufacturing a reason of its own.
      const bundleSignals = dedupeSignals(
        BUNDLE_MEMBERS.flatMap((slug) => signalsBySlug.get(slug) ?? []),
      );
      scored.set(BUNDLE_SLUG, {
        productKey: BUNDLE_SLUG,
        productName: bundle.name,
        matchClass: bundleClass,
        why: bundleWhy,
        need: bundleNeed,
        whenToUse: bundleWhen,
        keyIngredients: [],
        methodStep: bundle.methodStep,
        rationale: buildRationale({
          matchClass: bundleClass,
          productName: bundle.name,
          functionServed: bundleNeed,
          signals: bundleSignals,
          productReason: bundleWhy,
          whenToUse: bundleWhen,
          source,
        }),
        score: allStrong ? STRONG_AT : GOOD_AT,
      });
    }
  }

  const matches = [...scored.values()].sort(
    (a, b) => CLASS_ORDER[a.matchClass] - CLASS_ORDER[b.matchClass] || b.score - a.score || a.methodStep - b.methodStep,
  );

  // Profile-level notes. The scalp one mirrors the CrownPrint report's own
  // guidance: product fit is not a substitute for a professional when discomfort
  // persists.
  const notes: string[] = [];
  if (scalpNow(profile, "tender", "itchy", "flaky")) {
    notes.push(
      "You told us your scalp is uncomfortable right now. If that persists, worsens, or comes with pain, sores, or hair loss, please see a licensed healthcare professional or dermatologist — that's beyond what product-fit guidance can evaluate.",
    );
  }
  if (stage(profile, "takedown-soon", "post-takedown")) {
    notes.push(
      "Around takedown, order matters as much as product: take the style down gently in sections, cleanse, detangle thoroughly, then deep condition before your next install.",
    );
  }
  if (missing.length === CORE_AXES.length) {
    notes.push(
      "This is current-state guidance only — we don't have your CrownPrint code, so none of your Core axes are in play here. Entering the code from your CrownPrint Intelligence Report changes these matches considerably.",
    );
  } else if (missing.length) {
    notes.push(
      `This is Core-based guidance from a partial CrownPrint code. We weren't given ${missing
        .map((a) => `${a.label} (${a.letter})`)
        .join(", ")}, so nothing here leans on ${missing.length === 1 ? "it" : "them"} — and we won't guess. Adding ${
        missing.length === 1 ? "that axis" : "those axes"
      } from your CrownPrint Intelligence Report sharpens these matches.`,
    );
  }
  if (!profile.state.concern) {
    notes.push("Tell us what your hair is dealing with right now and these matches sharpen considerably — your CrownState is what moves them.");
  }

  return {
    priorityLabel: priorityLabel(profile),
    priorities: currentPriorities(profile),
    functions: productFunctions(profile),
    matches,
    gaps: catalogGaps(profile),
    notes,
    noStrongMatch: !matches.some((m) => m.matchClass === "strong"),
    noFit: matches.length === 0,
    whatToLookFor: whatToLookFor(profile),
    missingAxes: missing.map((a) => ({ id: a.id, letter: a.letter, label: a.label })),
    confidence: missing.length ? "reduced" : "full",
  };
}

// ---------------------------------------------------------------------------
// Current priorities, in order. Same framing the CrownPrint Intelligence Report
// uses — a comfortable scalp before moisture, moisture before strength, and
// protective-style care alongside whatever else is true — applied to the
// signals this shopper actually gave us. Consumer-safe labels only.
// ---------------------------------------------------------------------------
export function currentPriorities(profile: CrownPrintProfile): LabelledPoint[] {
  const out: LabelledPoint[] = [];
  const add = (condition: boolean, label: string, detail: string) => { if (condition) out.push({ label, detail }); };

  add(scalpUnsettled(profile), "Scalp comfort",
    "Your scalp is the limiting factor right now, and healthy hair grows from a comfortable scalp. Solve this before adding anything else to the routine.");
  add(concern(profile, "dryness") || por(profile, "high") || por(profile, "low"), "Moisture balance",
    por(profile, "high")
      ? "Higher-porosity behavior means moisture leaves as readily as it enters, so retention — not application — is the lever."
      : por(profile, "low")
        ? "Low-porosity behavior means moisture is slow to get in, so warmth, timing, and lighter formulas matter more than richness."
        : "Getting moisture in and keeping it there is the thing your routine has to do consistently.");
  add(concern(profile, "breakage") || ela(profile, "low") || thk(profile, "fine"), "Strength and breakage reduction",
    ela(profile, "low")
      ? "Low elasticity means strands stretch and snap rather than springing back — worth addressing before other goals."
      : "Your strand thickness and what you're noticing put breakage risk high on the list.");
  add(concern(profile, "shedding") || goal(profile, "growth") || den(profile, "low"), "Length retention",
    "Keeping the length you already grow is a scalp-and-handling problem more than a product-richness one.");
  add(concern(profile, "buildup") || scalpNow(profile, "oily") || scalpType(profile, "oily"), "A clean baseline",
    "Residue on the cuticle blocks the moisture you're already applying, so clearing it comes before adding more.");
  add(inProtective(profile), "Protective-style care",
    "You're working with a protective style, so scalp care during wear and a gentle takedown plan protect the result.");
  add(concern(profile, "definition") || concern(profile, "frizz") || goal(profile, "definition"), "Definition and frizz control",
    "Definition holds when the moisture underneath it holds — the styling step is the last one, not the first.");

  if (!out.length) {
    out.push({
      label: "Consistency",
      detail: "Nothing in your CrownPrint pulls hard in a competing direction. A steady routine will do more for you than chasing new products.",
    });
  }
  return out.slice(0, 4);
}

// ---------------------------------------------------------------------------
// The routine FUNCTIONS this CrownPrint needs — named independently of any
// product, so a shopper can act on them here or anywhere else.
// ---------------------------------------------------------------------------
export function productFunctions(profile: CrownPrintProfile): LabelledPoint[] {
  const out: LabelledPoint[] = [];
  const add = (condition: boolean, label: string, detail: string) => { if (condition) out.push({ label, detail }); };

  add(true, "Gentle, non-stripping cleansing",
    scalpType(profile, "oily") || scalpNow(profile, "oily") || concern(profile, "buildup")
      ? "On a shorter cadence than most — your scalp and buildup signals say wash more often, not harder."
      : "A sulfate-free wash on a steady cadence. Frequency is the dial, not harshness.");
  add(por(profile, "low") || thk(profile, "coarse") || concern(profile, "dryness") || por(profile, "high"), "Deep conditioning with contact time",
    por(profile, "low") || thk(profile, "coarse")
      ? "Warmth and a full 20 minutes do more for you than a heavier formula does."
      : "A real conditioning step every wash day, not a rinse-out you leave on for a minute.");
  add(ela(profile, "low") || concern(profile, "breakage"), "Occasional protein or strengthening",
    "Used periodically and always followed by moisture — protein alone on low elasticity makes hair more brittle, not less.");
  add(ela(profile, "high") && !concern(profile, "breakage"), "Minimal protein",
    "Your elasticity is already good. Moisture-forward products serve you better, and too much protein will read as stiffness.");
  add(true, "Water-based daily moisture",
    inProtective(profile)
      ? "Something light enough to reach the scalp and lengths through the style — a mist or spray, not a cream."
      : "A leave-in step between wash days so hair isn't waiting a week for moisture.");
  add(por(profile, "high") || thk(profile, "coarse") || concern(profile, "dryness"), "Sealing",
    "An oil or butter over the water-based step. Without it, the moisture you add leaves before it does anything.");
  add(scalpUnsettled(profile) || concern(profile, "shedding") || goal(profile, "growth") || inProtective(profile), "Direct scalp care",
    "Applied to the scalp itself — parts and rows — not distributed through the lengths and hoped for.");
  add(tensionRisk(profile) || inProtective(profile), "Low-tension handling and overnight protection",
    "Satin at night, gentler ties, no daily edge brushing. No product outperforms the tension that causes the damage.");
  add(concern(profile, "definition") || concern(profile, "frizz") || goal(profile, "definition"), "Styling that carries moisture",
    "A styler applied to damp hair that defines without drying the strand out as it sets.");

  return out;
}

// ---------------------------------------------------------------------------
// What Wynn does NOT currently carry.
//
// Named plainly, because a shopper acting on the section above deserves to know
// which parts of it we can't sell them. A gap is only listed when THIS
// CrownPrint actually needs the function — this is not a catalog wish list.
// ---------------------------------------------------------------------------
export function catalogGaps(profile: CrownPrintProfile): LabelledPoint[] {
  const out: LabelledPoint[] = [];
  const add = (condition: boolean, label: string, detail: string) => { if (condition) out.push({ label, detail }); };

  add(concern(profile, "buildup") || scalpType(profile, "oily") || scalpNow(profile, "oily"), "A clarifying or chelating shampoo",
    "Lathyr is deliberately gentle and sulfate-free. If you're dealing with hard water, silicones, or heavy wax buildup, you'll occasionally need something that clarifies harder than we make — followed immediately by a moisture step.");
  add(profile.state.style === "silkpress", "A heat protectant",
    "We don't make one. If you press, blow-dry, or flat iron, use a dedicated heat protectant — it's the highest-value product in that routine, and no oil substitutes for it.");
  add(ela(profile, "low") && (concern(profile, "breakage") || goal(profile, "repair")), "A bond-building repair treatment",
    "Revaivl is protein-based conditioning, which is a different category. If your hair is chemically processed and structurally damaged, a bond builder does something we don't offer.");
  add(concern(profile, "definition") || goal(profile, "definition"), "A firm-hold gel, custard, or mousse",
    "ThairaP is a moisture cream — it defines softly. For long-lasting hold on a wash-and-go, or for a set that has to survive humidity, you'd want a gel or custard, and we don't currently make one.");
  add(scalpNow(profile, "flaky") || (scalpType(profile, "dry") && concern(profile, "scalp")), "A medicated anti-dandruff treatment",
    "Relief is a wellness oil, not a medicated product. Persistent flaking often needs an active — zinc pyrithione, ketoconazole, or salicylic acid — from a pharmacy, or a visit to a dermatologist.");
  add(por(profile, "high") && thk(profile, "coarse"), "A thick leave-in conditioning cream",
    "Hydrate is a light mist by design. Coarse, high-porosity strands sometimes want a heavier leave-in cream underneath the oil — that layer is a genuine gap in our line.");
  add(concern(profile, "shedding") && den(profile, "low"), "A scalp serum with actives",
    "Grow is a botanical oil blend. If shedding is significant or sudden, that's a question for a professional, and treatments with clinical actives are outside what we make.");

  return out;
}

// ---------------------------------------------------------------------------
// Honest fit. When the collection doesn't have an answer for a CrownPrint — or
// doesn't have a strong one — the shopper still deserves to leave knowing what
// to buy. This guidance is brand-agnostic on purpose: it describes formulation
// and ingredient FUNCTIONS to look for on any label, ours included, and says
// plainly what may not suit them. Naming ingredient families is not a claim that
// any product works; it is what their CrownPrint axes point at.
// ---------------------------------------------------------------------------

const push = (list: string[], condition: boolean, text: string) => { if (condition) list.push(text); };

export function whatToLookFor(profile: CrownPrintProfile): WhatToLookFor {
  const scalpFirst = scalpUnsettled(profile);
  const dry = concern(profile, "dryness") || por(profile, "high");
  const weak = concern(profile, "breakage") || ela(profile, "low");
  const losing = concern(profile, "shedding") || goal(profile, "growth");
  const coated = concern(profile, "buildup") || scalpNow(profile, "oily") || scalpType(profile, "oily");
  const styling = concern(profile, "definition") || concern(profile, "frizz") || goal(profile, "definition");

  const hairNeed = scalpFirst
    ? "A calmer scalp first. Everything else — moisture, strength, styling — works better once the scalp is comfortable, so that's the need to solve ahead of the others."
    : dry
      ? "Moisture that stays in, not just moisture that goes on. Retention is the lever for you, which means a water-based step followed by something that holds it there."
      : weak
        ? "Strength and elasticity support alongside moisture, so strands stretch and return instead of snapping — protein on its own would make this worse, not better."
        : losing
          ? "Scalp support and gentler handling, so you keep the length you grow. This is a tension-and-scalp problem more than a product-richness one."
          : coated
            ? "A clean baseline. Residue on the cuticle is what's blocking the moisture you're already applying, so removing it comes before adding anything."
            : styling
              ? "Definition that keeps its moisture — hold that doesn't dry out into crunch or frizz as the style sets."
              : "A consistent, repeatable routine matched to your Core. No single product is the answer; the rhythm is.";

  const productType = scalpFirst
    ? "A lightweight scalp treatment or dropper oil you can apply directly along the parts, plus a gentle, sulfate-free cleanser on a steady cadence."
    : dry
      ? "A water-based leave-in, mist, or cream to hydrate, then a sealing oil or butter chosen for your strand thickness to keep it in."
      : weak
        ? "A protein or bond-supporting treatment used occasionally, always followed by a moisturizing deep conditioner."
        : losing
          ? "A scalp-focused oil or serum for the roots and parts, plus low-tension tools — satin ties, wide-tooth detangling, no daily edge brushing."
          : coated
            ? "A clarifying-but-gentle cleanser, then a moisture step to follow it — never a clarifying wash on its own."
            : styling
              ? "A moisturizing styling cream or defining product with a light film-former, applied to damp hair."
              : "A four-step routine: cleanse, condition, hydrate, seal — in that order, at a cadence you can keep.";

  const formulationCharacteristics: string[] = [];
  push(formulationCharacteristics, por(profile, "low"), "Lightweight, water-first formulas — humectants high on the ingredient list, heavy butters low or absent. Warmth (a cap, steam, a warm towel) does more for you than weight does.");
  push(formulationCharacteristics, por(profile, "high"), "Layerable textures: something water-based to hydrate, then a genuinely occlusive step — a butter or heavier oil — to close it in.");
  push(formulationCharacteristics, por(profile, "medium"), "Moderate-weight formulas. You have flexibility, so consistency and cadence matter more than intensity.");
  push(formulationCharacteristics, thk(profile, "fine"), "Light textures — sprays, milks, and lotions rather than thick butters, which fine strands wear as weight.");
  push(formulationCharacteristics, thk(profile, "coarse"), "Richer creams and butters with real slip; coarse strands need more product contact time to absorb anything.");
  push(formulationCharacteristics, den(profile, "high"), "Formulas that spread easily so you can section and distribute — thin enough to reach every layer, not just the outside.");
  push(formulationCharacteristics, den(profile, "low"), "Weightless finishes that won't flatten the hair or make the scalp more visible.");
  push(formulationCharacteristics, ela(profile, "low"), "Formulas that pair protein with conditioning agents in the same product, rather than protein alone.");
  push(formulationCharacteristics, ela(profile, "high"), "Moisture-forward formulas; you rarely need added protein and will feel it quickly when there's too much.");
  push(formulationCharacteristics, scalpType(profile, "dry", "sensitive") || scalpFirst, "Fragrance-light and drying-alcohol-free anywhere near the scalp.");
  push(formulationCharacteristics, coated, "Non-occlusive at the root — nothing heavy that sits and seals on the scalp itself.");

  const ingredientFunctions: string[] = [];
  push(ingredientFunctions, dry || por(profile, "low"), "Humectants that draw water in — glycerin, aloe vera, honey, panthenol.");
  push(ingredientFunctions, dry || por(profile, "high") || thk(profile, "coarse"), "Occlusives that hold water in — shea butter, castor oil, coconut oil, heavier plant butters.");
  push(ingredientFunctions, thk(profile, "fine") || por(profile, "low"), "Light emollients that soften without weight — jojoba, grapeseed, sweet almond, sunflower.");
  push(ingredientFunctions, weak, "Proteins and amino acids for temporary strength — hydrolyzed rice, wheat, or silk protein.");
  push(ingredientFunctions, den(profile, "high") || thk(profile, "coarse"), "Cationic conditioning agents for slip and detangling — behentrimonium methosulfate, cetrimonium chloride.");
  push(ingredientFunctions, coated, "Gentle non-sulfate surfactants — decyl glucoside, cocamidopropyl betaine, sodium lauroyl lactylate.");
  push(ingredientFunctions, scalpFirst, "Soothing botanicals for the scalp — tea tree, peppermint, chamomile, aloe.");
  push(ingredientFunctions, losing, "Scalp-supporting oils — rosemary, black seed, castor.");
  push(ingredientFunctions, styling, "Light film-formers for definition without stiffness — flaxseed, polyquaternium.");
  if (!ingredientFunctions.length) ingredientFunctions.push("Humectants to hydrate, emollients to soften, and an occlusive to seal — the three functions every routine needs in some proportion.");

  const whatMayNotFit: string[] = [];
  push(whatMayNotFit, por(profile, "low"), "Heavy butters, waxes, and mineral-oil-forward products — they sit on top of a low-porosity cuticle instead of going in.");
  push(whatMayNotFit, por(profile, "high"), "A water-only routine with nothing to seal it, and frequent clarifying with no moisture step behind it.");
  push(whatMayNotFit, thk(profile, "fine"), "Thick creams and heavy sealing oils used generously — fine strands go limp before they go soft.");
  push(whatMayNotFit, ela(profile, "high"), "Frequent protein treatments. Too much protein on hair that doesn't need it reads as stiff and brittle.");
  push(whatMayNotFit, coated, "Heavy oils and greases applied to the roots, and 'nourishing' scalp products that are really just occlusive.");
  push(whatMayNotFit, scalpType(profile, "dry", "sensitive") || scalpFirst, "High-fragrance products, drying alcohols, and sulfate-heavy shampoos on an already-uncomfortable scalp.");
  push(whatMayNotFit, weak, "Tight styles, daily heat, and elastics that crease — no product outperforms the tension that's causing the breakage.");
  push(whatMayNotFit, den(profile, "low"), "Anything that coats and flattens; weight reads as thinner hair, not fuller.");
  if (!whatMayNotFit.length) whatMayNotFit.push("Any product promising to be the whole routine at once.");

  const signals = describeCoreShort(profile);
  const whyThisMatters = signals
    ? `Your Core reads ${signals}. Those are the traits that decide how a product behaves on your hair, whoever makes it — so use them as the filter, not the marketing on the front of the bottle. Guidance here is brand-agnostic: a better match for your profile stays a better match regardless of who sells it.`
    : "Guidance here is brand-agnostic: a better match for your profile stays a better match regardless of who sells it. Add your CrownPrint code above and this sharpens to your specific axes.";

  return { hairNeed, productType, formulationCharacteristics, ingredientFunctions, whatMayNotFit, whyThisMatters };
}

/** "P3 (high porosity) and T1 (fine)" — the axes in play, for the guidance copy. */
function describeCoreShort(profile: CrownPrintProfile): string {
  const parts = [
    profile.core.porosity ? `${profile.core.porosity} porosity` : null,
    profile.core.density ? `${profile.core.density} density` : null,
    profile.core.thickness ? `${profile.core.thickness} strands` : null,
    profile.core.scalp ? `a ${profile.core.scalp} scalp type` : null,
    profile.core.elasticity ? `${profile.core.elasticity} elasticity` : null,
  ].filter((p): p is string => Boolean(p));
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
