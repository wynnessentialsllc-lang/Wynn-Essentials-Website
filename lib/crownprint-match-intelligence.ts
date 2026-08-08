// Shop by CrownPrint™ — customer-facing Match Intelligence.
//
// WHAT THIS IS
// Every CrownPrint recommendation carries one of three classifications: Strong,
// Good, or Conditional. Those words were doing work on the page long before a
// shopper was ever told what they meant. This module is the single place that
// says it — the legend that runs above the results, and the per-card reasoning
// that explains why THIS product landed in THAT class for THIS shopper.
//
// TWO RULES SHAPE EVERY STRING IN HERE
//
//  1. A classification describes the DEGREE and CONTEXT of fit, never product
//     quality. A Good or Conditional Match is not a worse product; it is a
//     product whose usefulness to this shopper depends on how central the need
//     is, or on context that changes. The legend says so in as many words,
//     because a shopper reading "Conditional" with no explanation will read it
//     as "second-rate" — and that would be both unfair and untrue.
//
//  2. Nothing internal is ever spoken. No scores, no weights, no thresholds, no
//     rule identifiers, and no invented match percentages. A number implies a
//     precision that product fit does not have. What a shopper gets instead is
//     the actual reasoning: which of their own CrownPrint signals produced the
//     classification, and which product function those signals point at.
//
// PROVENANCE IS PART OF THE EXPLANATION
// A trusted CrownPrint 360 context, resolved by the Hair Wellness Lab, is the
// primary source whenever it exists. The manual Core fallback behind /crownprint
// is genuinely useful and says exactly what it is: less context, and never a
// 360-level verdict. Every rationale carries that note with it, so the claim can
// never drift away from the evidence that supports it.
//
// Dependency-free TypeScript (no React, no next/*, no env) so the copy and the
// reasoning are directly unit-testable — see tests/crownprint-match-intelligence.test.mjs.

import {
  CORE_AXES,
  STATE_FIELDS,
  type CoreAxisId,
  type StateFieldId,
} from "./crownprint-code";

export type MatchClass = "strong" | "good" | "conditional";

/** Which authority produced the guidance a classification was made from. */
export type GuidanceSource = "crownprint-360" | "core" | "core-partial" | "crownstate-only";

// ---------------------------------------------------------------------------
// The definitions. These are the customer-facing meaning of each class, and the
// only place they are worded.
// ---------------------------------------------------------------------------

export type MatchClassDefinition = {
  id: MatchClass;
  /** The class name as printed: "STRONG MATCH". */
  title: string;
  /** The one-line promise. */
  headline: string;
  /** The full definition shown in the legend. */
  definition: string;
  /** The heading printed on every product card of this class. */
  cardHeading: string;
};

export const MATCH_CLASS_DEFINITIONS: Record<MatchClass, MatchClassDefinition> = {
  strong: {
    id: "strong",
    title: "STRONG MATCH",
    headline: "High alignment with your current CrownPrint needs.",
    definition:
      "The product directly serves one or more higher-priority product functions identified from your trusted CrownPrint context.",
    cardHeading: "WHY THIS IS A STRONG MATCH FOR YOU",
  },
  good: {
    id: "good",
    title: "GOOD MATCH",
    headline: "Useful support for your CrownPrint.",
    definition:
      "The product serves an identified need, but is less central, less comprehensive, or less strongly supported than a Strong Match.",
    cardHeading: "WHY THIS IS A GOOD MATCH FOR YOU",
  },
  conditional: {
    id: "conditional",
    title: "CONDITIONAL MATCH",
    headline: "Potentially useful depending on when and how it is used.",
    definition:
      "Its relevance depends on changing context — your CrownState, your current style or protective stage, your scalp condition, your environment, your hair history, heat or chemical exposure, or another applicable signal.",
    cardHeading: "WHY THIS MATCH IS CONDITIONAL",
  },
};

export const MATCH_CLASS_ORDER: MatchClass[] = ["strong", "good", "conditional"];

/** The heading a card of this class prints above its individualized reasoning. */
export const cardHeadingFor = (matchClass: MatchClass): string =>
  MATCH_CLASS_DEFINITIONS[matchClass].cardHeading;

// ---------------------------------------------------------------------------
// The legend. Rendered above the results on /crownprint and /shop-by-crownprint.
// ---------------------------------------------------------------------------

export const MATCH_LEGEND = {
  eyebrow: "MATCH INTELLIGENCE",
  title: "How Your CrownPrint Matches Work",
  intro:
    "Every product below is labelled Strong, Good, or Conditional. Here is exactly what each label means, so you can read your results the way they are meant to be read.",
  qualityHeading: "Fit is not the same as quality",
  quality:
    "These classifications describe the degree and context of fit — how closely a product lines up with what your CrownPrint needs right now. They are not a rating of product quality. A Good Match or a Conditional Match is not a bad product: it is a product whose usefulness to you depends on how central that need is, or on context that can change. Every Wynn Essentials product is made to the same standard. What changes is whether it is the right thing for you, this week.",
  changeHeading: "Why your matches can change over time",
  change:
    "Your CrownPrint Core — porosity, density, strand thickness, scalp type, and elasticity — is the foundation, and it stays relatively stable. Dynamic factors sit on top of it: your CrownState, your current style or protective stage, your scalp condition, your environment and season, your hair history, and any heat or chemical exposure. The Core decides how your hair behaves; the dynamic factors decide which products deserve priority right now. That is why the same CrownPrint can produce a different order of recommendations a month from now.",
  readingHeading: "How to read each card",
  reading:
    "Every match below states which of your own CrownPrint signals produced its classification, and which product function those signals point at. Conditional matches go further: they name the condition that makes the product relevant, when to consider using it, and when it may not be necessary at all.",
  noNumbers:
    "We don't publish match percentages or internal numbers. A figure would imply a precision that product fit doesn't have. What you get instead is the reasoning behind every classification.",
} as const;

/**
 * The provenance line under the legend. This is where the primary-source rule is
 * stated to the shopper: a trusted CrownPrint 360 is the fullest context these
 * classifications can be made with, and the manual Core fallback says plainly
 * that it is working with less.
 */
export function legendContextNote(source: GuidanceSource): string {
  if (source === "crownprint-360") {
    return "Every classification below is made against your trusted CrownPrint 360 context, resolved by the Hair Wellness Lab from your assessment, your CrownState, and your CrownHistory. That is the fullest context these labels can be applied with.";
  }
  if (source === "crownstate-only") {
    return "These classifications are made only from what you told us on this page — no CrownPrint code. That is the lightest context we work from, so read them as a useful starting point rather than a verdict. Your full CrownPrint 360, resolved by the Hair Wellness Lab from your whole assessment, CrownState, and CrownHistory, carries far more context than this page has.";
  }
  if (source === "core-partial") {
    return "These classifications are made from a partial CrownPrint Core code and what you told us on this page. We don't fill in the axes you didn't give us, so this is less context than your full CrownPrint 360 — read it as well-informed fit guidance, not a 360-level verdict. Connecting your Hair Wellness Lab CrownPrint sharpens every label below.";
  }
  return "These classifications are made from your CrownPrint Core code and what you told us on this page. That is real context, but it is less context than your full CrownPrint 360 Product Blueprint, which the Hair Wellness Lab resolves from your whole assessment, CrownState, and CrownHistory — so read them as well-informed fit guidance, not a 360-level verdict. Connecting your Hair Wellness Lab CrownPrint sharpens every label below.";
}

// ---------------------------------------------------------------------------
// Signals — the shopper-specific evidence a classification rests on.
//
// A signal is never a restatement of an answer. It carries the four forms the
// reasoning needs: a short label for the chip row, a sentence fragment for the
// explanation, a conditional clause ("you're wearing braids right now"), and the
// negation of that clause, so a Conditional Match can say when it stops being
// relevant instead of leaving the shopper to guess.
// ---------------------------------------------------------------------------

export type MatchSignal = {
  source: "core" | "crownstate" | "resolved";
  /** Short form, for the "your signals" row: "High porosity (P3)". */
  label: string;
  /** Sentence fragment: "high porosity (P3) in your CrownPrint Core". */
  phrase: string;
  /** Condition clause: "your scalp is tender right now". */
  clause: string;
  /** The negation: "the tenderness settles". */
  unlessClause: string;
  /** True for the factors that change week to week — CrownState and the like. */
  dynamic: boolean;
};

/** One CrownPrint Core axis, as evidence. Stable, so never a condition on its own. */
export function coreSignal(id: CoreAxisId, value: string | undefined): MatchSignal | null {
  if (!value) return null;
  const axis = CORE_AXES.find((a) => a.id === id);
  const level = axis?.levels.find((l) => l.value === value);
  if (!axis || !level) return null;
  // "Coarse" alone reads as a fragment; the other axes already name themselves.
  const name = id === "thickness" ? `${level.label.toLowerCase()} strands` : level.label.toLowerCase();
  const code = `${axis.letter}${level.level}`;
  return {
    source: "core",
    label: `${id === "thickness" ? `${level.label} strands` : level.label} (${code})`,
    phrase: `${name} (${code}) in your CrownPrint Core`,
    clause: `your CrownPrint Core reads ${name} (${code})`,
    unlessClause: "that need is already being met by the rest of your routine",
    dynamic: false,
  };
}

// The clause forms for CrownState. Written out per value rather than generated,
// because "you're wearing loose natural right now" is not English and a shopper
// reading their own condition back deserves a sentence, not a slot fill.
const STATE_CLAUSES: Partial<Record<StateFieldId, Record<string, [string, string, string]>>> = {
  style: {
    braids: ["the braids you're wearing right now", "you're wearing braids", "you take them down or switch to another style"],
    locs: ["the locs you're wearing right now", "you're wearing locs", "your styling changes"],
    twists: ["the twists you're wearing right now", "you're wearing twists", "you take them down or switch to another style"],
    wig: ["the wig or weave you're wearing right now", "you're wearing a wig or weave", "you take it off for an extended stretch"],
    natural: ["wearing your hair loose right now", "you're wearing your hair loose", "you move into a protective style"],
    silkpress: ["the silk press you're wearing right now", "you're wearing a silk press", "you go back to wearing your hair in its natural texture"],
  },
  stage: {
    fresh: ["a freshly installed style", "your style is freshly installed", "you move further into the wear"],
    mid: ["being mid-wear in your current style", "you're mid-wear in this style", "you reach takedown"],
    "takedown-soon": ["having takedown coming up", "takedown is coming up", "you're settled into your next style"],
    "post-takedown": ["having just taken your style down", "you've just taken a style down", "you're past the first recovery washes"],
    none: ["not being in a protective style", "you're not in a protective style", "you install one"],
  },
  scalpNow: {
    comfortable: ["the comfortable scalp you reported this week", "your scalp is comfortable right now", "your scalp becomes uncomfortable"],
    tender: ["the tender scalp you told us about this week", "your scalp is tender right now", "the tenderness settles"],
    itchy: ["the itching you told us about this week", "your scalp is itchy right now", "the itching settles"],
    flaky: ["the dryness or flaking you told us about this week", "your scalp is dry or flaking right now", "the flaking settles"],
    oily: ["the oiliness you told us about this week", "your scalp is running oily right now", "your scalp balances out again"],
  },
};

/** One CrownState answer, as evidence. Dynamic by definition — it changes. */
export function stateSignal(id: StateFieldId, value: string | undefined): MatchSignal | null {
  if (!value) return null;
  const field = STATE_FIELDS.find((f) => f.id === id);
  const option = field?.options.find((o) => o.value === value);
  if (!field || !option) return null;

  const low = option.label.toLowerCase();
  const written = STATE_CLAUSES[id]?.[value];
  const [phrase, clause, unless] = written ?? (
    id === "concern"
      ? [`${low} as the main thing you're dealing with right now`, `${low} is your main concern`, `${low} stops being your main concern`]
      : id === "goal"
        ? [`your current goal of ${low}`, `you're working toward ${low}`, "your goal changes"]
        : [low, `your CrownState reads ${low}`, "that changes"]
  );

  return { source: "crownstate", label: option.label, phrase, clause, unlessClause: unless, dynamic: true };
}

/**
 * A signal that arrived already resolved from the Hair Wellness Lab — a ranked
 * priority, a resolved product function, a CrownState summary. Wynn renders it;
 * Wynn never derives it.
 */
export function resolvedSignal(
  label: string,
  phrase: string,
  options: { clause?: string; unlessClause?: string; dynamic?: boolean } = {},
): MatchSignal {
  return {
    source: "resolved",
    label,
    phrase,
    clause: options.clause ?? phrase,
    unlessClause: options.unlessClause ?? "that resolved context changes",
    dynamic: options.dynamic ?? false,
  };
}

/** Same signal twice is not two reasons. Order is preserved; strength decides it. */
export function dedupeSignals(signals: (MatchSignal | null | undefined)[]): MatchSignal[] {
  const seen = new Set<string>();
  const out: MatchSignal[] = [];
  for (const signal of signals) {
    if (!signal) continue;
    const key = signal.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The rationale itself.
// ---------------------------------------------------------------------------

export type MatchRationale = {
  matchClass: MatchClass;
  /** "WHY THIS IS A STRONG MATCH FOR YOU" and friends. */
  heading: string;
  /** Short labels for the signals responsible — the chip row on the card. */
  signals: string[];
  /** The routine function those signals point at. */
  functionServed: string;
  /** The individualized explanation. Never empty. */
  explanation: string;
  /** Conditional only — what makes this product relevant at all. */
  condition?: string;
  /**
   * Conditional only — the label of the signal the condition is built on. Always
   * one of `signals`, so the condition can be traced back to the shopper's own
   * evidence rather than read as a generic disclaimer.
   */
  conditionSignal?: string;
  /** Conditional only — when to consider using it. */
  whenItApplies?: string;
  /** Conditional only — when it may not be necessary. */
  whenItMayNotBeNeeded?: string;
  /** How much context this reasoning had. Never implies 360 certainty. */
  contextNote: string;
};

/**
 * Lowercase an opening word so a label can be dropped mid-sentence — but leave
 * acronyms and the Crown* vocabulary alone. "CrownState" must not become
 * "crownState" just because it happened to open a clause.
 */
function lowerFirst(s: string): string {
  if (!s) return s;
  const firstWord = s.split(/\s+/)[0];
  if (/[A-Z]/.test(firstWord.slice(1))) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** The provenance sentence carried on every card, matching the legend's note. */
export function rationaleContextNote(source: GuidanceSource): string {
  if (source === "crownprint-360") {
    return "Resolved from your trusted CrownPrint 360 context at the Hair Wellness Lab.";
  }
  if (source === "crownstate-only") {
    return "Based only on what you told us on this page — no CrownPrint code, so this carries far less context than your CrownPrint 360.";
  }
  if (source === "core-partial") {
    return "Based on a partial CrownPrint Core code and what you told us here. Less context than your CrownPrint 360, and nothing is assumed in place of the axes we weren't given.";
  }
  return "Based on your CrownPrint Core code and what you told us here — less context than your full CrownPrint 360.";
}

export type RationaleInput = {
  matchClass: MatchClass;
  productName: string;
  /** The routine role this product plays — what it is being recommended TO DO. */
  functionServed: string;
  /** The shopper-specific signals responsible for the classification. */
  signals: MatchSignal[];
  /** The product-level reason, in the voice the rest of the card uses. */
  productReason?: string;
  /** Usage cadence, reused as "when to consider it" on a Conditional Match. */
  whenToUse?: string;
  /**
   * The card's honest caveat, when it has one. On a Conditional Match this is
   * the most concrete answer to "when may I not need this?", so it is folded
   * into that line rather than left to sit somewhere else on the card.
   */
  caution?: string;
  /** Core axes the reasoning leans on that we were never given. */
  limitedBy?: string[];
  /**
   * True when Wynn added this itself to serve a function HWL resolved. Wynn may
   * map its catalog onto HWL's needs; it may never promote a product to Strong
   * that HWL did not support — this flag is what says so on the card.
   */
  wynnFilled?: boolean;
  source: GuidanceSource;
};

/**
 * Build the classification-specific explanation for one product card.
 *
 * The shape is always the same three moves: name the shopper's own signals, say
 * which product function they point at, then say what makes that combination
 * Strong, Good, or Conditional. A Conditional Match adds the three things a
 * shopper actually needs in order to decide — the condition, when it applies,
 * and when it does not.
 */
export function buildRationale(input: RationaleInput): MatchRationale {
  const { matchClass, productName, functionServed, productReason, whenToUse, caution, limitedBy, wynnFilled, source } = input;
  const signals = dedupeSignals(input.signals).slice(0, 3);
  const phrases = signals.map((s) => s.phrase);
  const fn = lowerFirst(functionServed);

  // A counted lead-in rather than the signal phrases as a bare subject. "The
  // braids you're wearing right now points at…" is what the bare form produces,
  // and number agreement across an arbitrary list of signals is not something
  // worth guessing at every render.
  const countWord = phrases.length === 1 ? "One" : phrases.length === 2 ? "Two" : "Three";
  const carrier =
    phrases.length === 1
      ? `One signal in your CrownPrint carries this match: ${phrases[0]}.`
      : `${countWord} signals in your CrownPrint carry this match: ${joinList(phrases)}.`;
  const pointer = phrases.length === 1 ? "It points" : "Together they point";

  const parts: string[] = [];
  const rationale: MatchRationale = {
    matchClass,
    heading: cardHeadingFor(matchClass),
    signals: signals.map((s) => s.label),
    functionServed,
    explanation: "",
    contextNote: rationaleContextNote(source),
  };

  if (matchClass === "strong") {
    parts.push(
      phrases.length
        ? `${carrier} ${pointer} straight at ${fn}, and ${productName} is the step in your routine that performs that function.`
        : `Your CrownPrint points straight at ${fn}, and ${productName} is the step in your routine that performs that function.`,
    );
    if (productReason) parts.push(productReason);
    parts.push(
      phrases.length > 1
        ? "Those signals reinforce each other rather than pulling in different directions, and the function they point at is one of the higher-priority jobs your routine has to do right now. That alignment is what makes this a Strong Match for you — not a general recommendation."
        : "That function is one of the higher-priority jobs your routine has to do right now, which is what makes this a Strong Match for you rather than a general recommendation.",
    );
  } else if (matchClass === "good") {
    parts.push(
      phrases.length
        ? `${carrier} ${pointer} at ${fn}, and ${productName} is what covers that step.`
        : `Your CrownPrint points at ${fn}, and ${productName} is what covers that step.`,
    );
    if (productReason) parts.push(productReason);
    if (wynnFilled) {
      parts.push(
        "It sits at Good rather than Strong on purpose: the Hair Wellness Lab identified the need, and Wynn Essentials matched its own catalog to it. Wynn never promotes a product to a Strong Match that the Lab did not support — selling it is not evidence that it is right for you.",
      );
    } else if (limitedBy?.length) {
      parts.push(
        `It sits at Good rather than Strong because part of the reasoning here leans on ${joinList(limitedBy)}, which your CrownPrint code didn't include. We won't assume what we weren't told, so we hold the classification back instead of overstating it.`,
      );
    } else {
      parts.push(
        "It sits at Good rather than Strong because this is supporting work in your routine: fewer of your CrownPrint signals converge on it, and the need it serves is less central right now than the ones above it. That is a statement about priority order, not about the product.",
      );
    }
  } else {
    const driver = signals.find((s) => s.dynamic) ?? signals[0];
    parts.push(
      phrases.length
        ? `${carrier} ${pointer} at ${fn}, so ${productName} can be genuinely useful to you — but its relevance turns on when and how you use it rather than on a standing need in your CrownPrint.`
        : `${productName} covers ${fn}, which can be genuinely useful to you — but its relevance turns on when and how you use it rather than on a standing need in your CrownPrint.`,
    );
    if (productReason) parts.push(productReason);
    parts.push(
      "That is what Conditional means here: the product is sound, and whether it earns a place in your routine depends on context that changes.",
    );

    if (driver) rationale.conditionSignal = driver.label;
    rationale.condition = driver
      ? `What makes it relevant: ${driver.clause}. While that holds, ${fn} is worth a place in your routine.`
      : `What makes it relevant: context rather than a standing need — your CrownState, your current style or protective stage, your scalp condition, your environment, your hair history, and any recent heat or chemical exposure.`;
    rationale.whenItApplies = driver
      ? `When to consider it: while ${driver.clause}.${whenToUse ? ` ${whenToUse}` : ""}`
      : `When to consider it:${whenToUse ? ` ${whenToUse}` : " when the context above applies to you."}`;
    // The caveat is the sharpest available answer to "when might I not need
    // this?", so on a Conditional Match it leads that line instead of being
    // filed away somewhere else on the card.
    const notNeeded = driver
      ? `If ${driver.unlessClause}, this stops being a priority for you. Leave it out rather than buying it just in case, and revisit it when that shifts.`
      : "If none of that context applies to you right now, this isn't a priority. Leave it out rather than buying it just in case.";
    rationale.whenItMayNotBeNeeded = `When it may not be necessary: ${caution ? `${caution} ` : ""}${notNeeded}`;
  }

  rationale.explanation = parts.filter(Boolean).join(" ");
  return rationale;
}
