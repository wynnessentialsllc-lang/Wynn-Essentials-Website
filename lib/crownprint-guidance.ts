// Shop by CrownPrint™ — the one place that decides WHOSE intelligence is being
// shown, and how much confidence it carries.
//
// THE ARCHITECTURE THIS ENFORCES
//
//   Hair Wellness Lab   = CrownPrint intelligence authority
//   Wynn Essentials     = catalog matching / commerce authority
//
// When a shopper has completed the secure connect flow, HWL has already resolved
// their CrownPrint 360: the code, the ranked priorities, the product functions
// their routine needs, their CrownState freshness, the matches, and the needs it
// determined Wynn does not carry. Wynn CONSUMES that. It does not re-derive it,
// does not second-guess it, and — this is the rule that matters — does not fall
// back to reconstructing a recommendation from P/D/T/S/E even when the shopper
// also happens to have typed their code in. A trusted 360 context always wins.
//
// Wynn's own engine (lib/crownprint-fit.ts) answers only the question Wynn owns:
// which products in ITS catalog serve the functions that were resolved, and
// which functions it cannot serve at all.
//
// The local Core reconstruction is a FALLBACK, and is labelled as one. It exists
// for three cases and no others:
//
//   1. manual CrownPrint code entry
//   2. a degraded path when the secure cross-site connection cannot complete
//   3. shareable, Core-based shopping guidance
//
// It is never presented as equivalent to the CrownPrint 360 Product Blueprint,
// and a partial code is never presented as equivalent to a complete one.
//
// Dependency-free TypeScript (no React, no next/*, no env) so the precedence
// itself is directly unit-testable — see tests/crownprint-architecture.test.mjs.

import type { CrownPrintProfile } from "./crownprint-code";
import { formatCrownPrintCode, missingCoreAxes } from "./crownprint-code";
import {
  matchFunctionsToCatalog,
  matchProducts,
  productUsage,
  whatToLookFor,
  type FitCatalogProduct,
  type FitMatch,
  type LabelledPoint,
  type MatchClass,
  type WhatToLookFor,
} from "./crownprint-fit";
import {
  buildRationale,
  resolvedSignal,
  type GuidanceSource,
  type MatchSignal,
} from "./crownprint-match-intelligence";

/**
 * Which authority produced what is on screen.
 *
 *   crownprint-360   HWL resolved this shopper's full CrownPrint 360. Wynn
 *                    matched its catalog to it.
 *   core             Wynn's own Core-based fallback, from a complete P-D-T-S-E code.
 *   core-partial     Wynn's own Core-based fallback, from an incomplete code.
 *   crownstate-only  No code at all — current-state answers only.
 *
 * Declared alongside the customer-facing Match Intelligence copy, because the
 * source is what decides how much certainty a classification may claim.
 */
export type { GuidanceSource };

/** What Wynn may do about CrownState. Mirrors crownStateAction() on the context. */
export type CrownStatePolicy = "none" | "refresh" | "ask";

export type Guidance = {
  source: GuidanceSource;
  /** Shopper-facing name for what they're looking at. Never overstated. */
  label: string;
  /** One sentence on what this guidance is, and what it isn't. */
  detail: string;
  /** "full" only for a connected 360 or a complete code. */
  confidence: "full" | "reduced" | "limited";
  /** True for everything except a connected 360 — drives the fallback labelling. */
  isFallback: boolean;
  code: string;
  crownStatePolicy: CrownStatePolicy;
  /** Core axes we were not given. Named, never inferred. */
  missingAxes: { letter: string; label: string }[];
  priorities: LabelledPoint[];
  functions: LabelledPoint[];
  matches: FitMatch[];
  gaps: LabelledPoint[];
  notes: string[];
  noFit: boolean;
  noStrongMatch: boolean;
  whatToLookFor: WhatToLookFor;
};

/** The subset of WynnMatchContext this module reads. */
export type TrustedContext = {
  crownPrintPresent: boolean;
  crownState: { present: boolean; fresh: boolean; message?: string; summary?: string };
  crownPrintCode?: string;
  currentPriorityLabel?: string;
  currentPriorities?: { label: string; detail?: string }[];
  productFunctionsNeeded?: { label: string; detail?: string }[];
  notCarried?: { label: string; detail?: string }[];
  matches: { productKey: string; productName: string; matchClass: MatchClass; why: string }[];
  noStrongMatch: boolean;
  whatToLookFor?: Partial<WhatToLookFor>;
};

const CLASS_ORDER: Record<MatchClass, number> = { strong: 0, good: 1, conditional: 2 };

/** A trusted context is only trusted when HWL says the CrownPrint is usable. */
export const hasTrusted360 = (context: TrustedContext | null | undefined): boolean =>
  Boolean(context && context.crownPrintPresent === true);

// Guidance shown when HWL sent no what-to-look-for of its own. Deliberately
// generic: with a 360 context, Wynn has no axes to reason from and must not
// invent any.
const GENERIC_GUIDANCE: WhatToLookFor = {
  hairNeed: "Your Hair Wellness Lab report is the authority on what your hair needs right now — it's the fuller picture, and it's worth reading alongside this.",
  productType: "Match products to the functions listed above rather than to marketing categories.",
  formulationCharacteristics: [],
  ingredientFunctions: [],
  whatMayNotFit: [],
  whyThisMatters:
    "Guidance is brand-agnostic: a better match for your CrownPrint stays a better match regardless of who sells it.",
};

/**
 * Build the guidance for this request.
 *
 * Precedence is absolute and lives here alone: a trusted CrownPrint 360 context
 * beats any locally reconstructed Core, including when both are present.
 */
export function selectGuidance({
  context,
  profile,
  catalog,
}: {
  context?: TrustedContext | null;
  profile?: CrownPrintProfile | null;
  catalog: FitCatalogProduct[];
}): Guidance {
  if (hasTrusted360(context)) return fromTrustedContext(context as TrustedContext, catalog);
  return fromLocalCore(profile ?? { core: {}, state: {} }, catalog);
}

// ---------------------------------------------------------------------------
// PRIMARY — a connected CrownPrint 360. HWL resolved it; Wynn matches its
// catalog to what was resolved and reports honestly on what it cannot serve.
// ---------------------------------------------------------------------------
function fromTrustedContext(context: TrustedContext, catalog: FitCatalogProduct[]): Guidance {
  const byName = new Map(catalog.map((p) => [p.slug, p]));

  // The shopper-specific evidence available on this path. Wynn has no axes here
  // and must not pretend otherwise: what it has is what the Lab already
  // resolved — the ranked priorities and the current CrownState summary — so
  // that is what the per-card reasoning is built from.
  const resolvedPriorities = context.currentPriorities?.length
    ? context.currentPriorities
    : context.currentPriorityLabel
      ? [{ label: context.currentPriorityLabel, detail: undefined }]
      : [];
  // Phrases are kept parenthetical rather than comma-qualified: these get joined
  // into one sentence, and a list of comma-carrying clauses stops being readable
  // at three items.
  const summary = context.crownState.summary?.replace(/\.$/, "");
  const crownStateSignal = summary
    ? resolvedSignal("Your current CrownState", `your current CrownState (${summary})`, {
        clause: `your CrownState reads ${summary}`,
        unlessClause: "your CrownState changes (a takedown, a calmer scalp, a new style, a new season)",
        dynamic: true,
      })
    : null;
  /**
   * The resolved evidence for one product.
   *
   * A priority that IS the function this product performs would otherwise be
   * announced twice in the same sentence ("…carry this match: scalp comfort …
   * they point at scalp comfort"), so it is dropped — naming it once is enough.
   * The "ranked first" wording is only used when the priority genuinely still is
   * the first one being shown.
   */
  const signalsFor = (need: string): MatchSignal[] => {
    const kept = resolvedPriorities
      .slice(0, 2)
      .filter((p) => p.label.trim().toLowerCase() !== need.trim().toLowerCase());
    const priorities = kept.map((p, i) =>
      resolvedSignal(
        p.label,
        i === 0 && p.label === resolvedPriorities[0]?.label
          ? `${lowerFirst(p.label)} (the priority the Hair Wellness Lab ranked first for you)`
          : `${lowerFirst(p.label)} (one of the priorities the Hair Wellness Lab resolved for you)`,
        { clause: `${lowerFirst(p.label)} is one of the priorities the Lab resolved for you` },
      ),
    );
    return [...priorities, ...(crownStateSignal ? [crownStateSignal] : [])];
  };

  // 1. HWL's own matches, in HWL's own classes. Wynn adds only catalog facts —
  //    the routine need a product serves and how often to use it — and never
  //    re-classifies or re-orders on its own reasoning.
  const matches: FitMatch[] = context.matches
    .filter((m) => byName.has(m.productKey))
    .map((m) => {
      const product = byName.get(m.productKey)!;
      const usage = productUsage(m.productKey);
      const need = usage?.need ?? "Part of your resolved routine";
      const whenToUse = usage?.whenToUse ?? "Follow the directions on the product page.";
      return {
        productKey: m.productKey,
        productName: product.name,
        matchClass: m.matchClass,
        why: m.why,
        need,
        whenToUse,
        keyIngredients: [],
        methodStep: product.methodStep,
        rationale: buildRationale({
          matchClass: m.matchClass,
          productName: product.name,
          functionServed: need,
          // The Lab's own resolved reason is the shopper-specific evidence here;
          // Wynn frames it against the function, and adds nothing to it.
          signals: signalsFor(need),
          productReason: m.why,
          whenToUse,
          source: "crownprint-360",
        }),
        score: 0,
      };
    });

  // 2. The resolved product functions are what Wynn matches its catalog against.
  const functions = (context.productFunctionsNeeded ?? []).map((f) => ({
    label: f.label,
    detail: f.detail ?? "",
  }));

  // HWL's `notCarried` is authoritative and outranks Wynn's own keyword match.
  // If the Lab has already determined we do not carry a function, no amount of
  // wording overlap may turn it into a product: a bond builder stays a gap even
  // though "strengthening" matches our protein conditioner. Excluded BEFORE
  // matching, so a gap can never become a recommendation by accident.
  const notCarriedLabels = new Set((context.notCarried ?? []).map((g) => g.label.trim().toLowerCase()));
  const matchable = (context.productFunctionsNeeded ?? []).filter(
    (f) => !notCarriedLabels.has(f.label.trim().toLowerCase()),
  );
  const coverage = matchFunctionsToCatalog(matchable, catalog);

  // 3. Anything the functions point at that HWL didn't already name is added as a
  //    GOOD match at most. HWL owns "strong"; Wynn filling a function it noticed
  //    is a catalog observation, not an intelligence verdict.
  const already = new Set(matches.map((m) => m.productKey));
  for (const fn of coverage.covered) {
    for (const slug of fn.slugs) {
      if (already.has(slug)) continue;
      const product = byName.get(slug);
      const usage = productUsage(slug);
      if (!product || !usage) continue;
      already.add(slug);
      const why = `Your CrownPrint calls for ${lowerFirst(fn.label)}, and this is what covers that step in the Wynn Essentials routine.`;
      matches.push({
        productKey: slug,
        productName: product.name,
        matchClass: "good",
        why,
        need: usage.need,
        whenToUse: usage.whenToUse,
        keyIngredients: [],
        methodStep: product.methodStep,
        rationale: buildRationale({
          matchClass: "good",
          productName: product.name,
          functionServed: usage.need,
          signals: [
            resolvedSignal(
              fn.label,
              `${lowerFirst(fn.label)} (a product function the Hair Wellness Lab resolved for you)`,
              { clause: `your resolved CrownPrint calls for ${lowerFirst(fn.label)}` },
            ),
            ...(crownStateSignal ? [crownStateSignal] : []),
          ],
          productReason: why,
          whenToUse: usage.whenToUse,
          // Wynn mapped its own catalog onto a need HWL named. That is a catalog
          // observation, not an intelligence verdict — so the card says so, and
          // the class is capped at Good.
          wynnFilled: true,
          source: "crownprint-360",
        }),
        score: 0,
      });
    }
  }

  matches.sort((a, b) => CLASS_ORDER[a.matchClass] - CLASS_ORDER[b.matchClass] || a.methodStep - b.methodStep);

  // 4. Gaps: what HWL already determined Wynn doesn't carry, plus any resolved
  //    function Wynn's catalog cannot serve. Never padded, never hidden.
  const gaps: LabelledPoint[] = [
    ...(context.notCarried ?? []).map((g) => ({
      label: g.label,
      detail: g.detail ?? "Your Hair Wellness Lab report identified this need, and Wynn Essentials doesn't currently make it.",
    })),
    ...coverage.unmet.map((f) => ({
      label: f.label,
      detail: f.detail || "Your resolved CrownPrint calls for this, and nothing in the Wynn Essentials collection serves it.",
    })),
  ].filter(dedupeByLabel());

  const priorities: LabelledPoint[] = (context.currentPriorities ?? []).map((p) => ({
    label: p.label,
    detail: p.detail ?? "",
  }));
  // Older HWL responses carry only the single priority label. Honour it rather
  // than inventing a ranked list Wynn was never given.
  if (!priorities.length && context.currentPriorityLabel) {
    priorities.push({ label: context.currentPriorityLabel, detail: "" });
  }

  const stale = context.crownState.fresh === false;
  const notes: string[] = [];
  if (context.crownState.summary) notes.push(`Your current CrownState, as resolved by the Hair Wellness Lab: ${context.crownState.summary}`);
  if (stale) {
    notes.push(
      context.crownState.message ||
        "Your CrownPrint Core hasn't changed, but the Hair Wellness Lab flagged your CrownState as out of date. Updating it there is free and takes a moment — these matches will follow it.",
    );
  }

  return {
    source: "crownprint-360",
    label: "CrownPrint 360 — resolved by the Hair Wellness Lab",
    detail:
      "Your full CrownPrint, resolved at the Hair Wellness Lab from your assessment, CrownState, and CrownHistory. Wynn Essentials matched its catalog to it.",
    confidence: "full",
    isFallback: false,
    code: context.crownPrintCode ?? "",
    // Fresh trusted CrownState is never re-asked; a stale one goes back to HWL's
    // free update flow, not to a Wynn questionnaire.
    crownStatePolicy: stale ? "refresh" : "none",
    missingAxes: [],
    priorities,
    functions,
    matches,
    gaps,
    notes,
    noFit: matches.length === 0,
    noStrongMatch: !matches.some((m) => m.matchClass === "strong"),
    whatToLookFor: mergeGuidance(context.whatToLookFor),
  };
}

// ---------------------------------------------------------------------------
// FALLBACK — Wynn's own Core-based reasoning. Useful, clearly labelled, and
// never dressed up as the full Blueprint.
// ---------------------------------------------------------------------------
function fromLocalCore(profile: CrownPrintProfile, catalog: FitCatalogProduct[]): Guidance {
  const fit = matchProducts(profile, catalog);
  const missing = missingCoreAxes(profile.core);
  const hasAnyAxis = Object.keys(profile.core).length > 0;

  const source: GuidanceSource = !hasAnyAxis ? "crownstate-only" : missing.length ? "core-partial" : "core";

  const label =
    source === "core"
      ? "Core-based guidance — from your CrownPrint code"
      : source === "core-partial"
        ? "Core-based guidance — partial code, reduced confidence"
        : "Current-state guidance — no CrownPrint code entered";

  const detail =
    source === "core"
      ? "Matched by Wynn Essentials from your CrownPrint Core and the current state you told us here. This is limited context: it isn't your full CrownPrint 360 Product Blueprint, which the Hair Wellness Lab resolves from your whole assessment, CrownState, and CrownHistory."
      : source === "core-partial"
        ? `Matched from a partial CrownPrint code. We're missing ${missing.map((a) => `${a.label} (${a.letter})`).join(", ")}, so nothing here leans on ${missing.length === 1 ? "that axis" : "those axes"} and nothing is assumed in ${missing.length === 1 ? "its" : "their"} place. This is not your full CrownPrint 360 Product Blueprint.`
        : "Matched from the current state you told us here, with no CrownPrint code. This is the lightest context we work from — useful, but a long way short of your CrownPrint 360 Product Blueprint.";

  return {
    source,
    label,
    detail,
    confidence: source === "core" ? "full" : source === "core-partial" ? "reduced" : "limited",
    isFallback: true,
    code: formatCrownPrintCode(profile.core),
    // The fallback is the only path that may ask, and it asks the minimum.
    crownStatePolicy: "ask",
    missingAxes: missing.map((a) => ({ letter: a.letter, label: a.label })),
    priorities: fit.priorities,
    functions: fit.functions,
    matches: fit.matches,
    gaps: fit.gaps,
    notes: fit.notes,
    noFit: fit.noFit,
    noStrongMatch: fit.noStrongMatch,
    whatToLookFor: fit.whatToLookFor,
  };
}

// ---------------------------------------------------------------------------

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const dedupeByLabel = () => {
  const seen = new Set<string>();
  return (point: LabelledPoint) => {
    const key = point.label.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
};

/** Use HWL's own what-to-look-for when it sent one; never fabricate axes. */
function mergeGuidance(supplied: Partial<WhatToLookFor> | undefined): WhatToLookFor {
  if (!supplied) return GENERIC_GUIDANCE;
  return {
    hairNeed: supplied.hairNeed || GENERIC_GUIDANCE.hairNeed,
    productType: supplied.productType || GENERIC_GUIDANCE.productType,
    formulationCharacteristics: supplied.formulationCharacteristics ?? [],
    ingredientFunctions: supplied.ingredientFunctions ?? [],
    whatMayNotFit: supplied.whatMayNotFit ?? [],
    whyThisMatters: supplied.whyThisMatters || GENERIC_GUIDANCE.whyThisMatters,
  };
}

export { whatToLookFor };
