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
import { resolveCatalogSlug } from "./crownprint-catalog-key";
import { formatCrownPrintCode, missingCoreAxes } from "./crownprint-code";
import {
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
  /**
   * The ONLY source of CrownPrint product cards. On the connected path this is
   * HWL's `matches` array intersected with the live catalog — nothing is ever
   * added to it from coverage, function labels, or category lookups.
   */
  matches: FitMatch[];
  /** Descriptive coverage for the explanation panel. Never renders products. */
  coverage: CoveragePoint[];
  /** Accessories/tools from HWL's explicit accessory channel. Never matches. */
  accessories: AccessorySupport[];
  gaps: LabelledPoint[];
  notes: string[];
  noFit: boolean;
  noStrongMatch: boolean;
  whatToLookFor: WhatToLookFor;
};

/** How Wynn served one resolved function. Descriptive; carries no product. */
export type CoverageStatus = "covered" | "partial" | "not_carried";

/**
 * One coverage row, ready to explain.
 *
 * `functionKey` is the stable integration identifier and the only thing either
 * side keys on. `label` is display text derived from the deprecated
 * `functionLabel` when HWL sent one, falling back to a readable form of the key
 * — it is never used to pick, rank, or filter anything.
 */
export type CoveragePoint = {
  functionKey: string;
  status: CoverageStatus;
  label: string;
  detail: string;
};

/** An accessory HWL explicitly suggested. Rendered apart from matches. */
export type AccessorySupport = { productKey: string; productName: string; why: string };

/** The subset of WynnMatchContext this module reads. */
export type TrustedContext = {
  crownPrintPresent: boolean;
  crownState: { present: boolean; fresh: boolean; message?: string; summary?: string };
  crownPrintCode?: string;
  currentPriorityLabel?: string;
  currentPriorities?: { label: string; detail?: string }[];
  productFunctionsNeeded?: { label: string; detail?: string }[];
  notCarried?: { label: string; detail?: string }[];
  coverage?: { functionKey: string; status: CoverageStatus; detail?: string; functionLabel?: string }[];
  accessories?: { productKey: string; why?: string }[];
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
  // HWL names products in its own vocabulary ("revaivl"); Wynn's catalog is
  // keyed by slug ("revaivl-protein-conditioner"). Resolve the two before the
  // join, and say so loudly when a product HWL authorized cannot be resolved —
  // that is a lost sale and a broken results page, and it used to happen in
  // total silence. productKey stays HWL's key, so the guard and the audit keep
  // comparing like with like; catalogSlug is what renders.
  const resolved = context.matches
    .map((m) => ({ match: m, catalogSlug: resolveCatalogSlug(m.productKey, catalog) }))
    .filter((r): r is { match: (typeof context.matches)[number]; catalogSlug: string } => {
      if (r.catalogSlug && byName.has(r.catalogSlug)) return true;
      console.error(
        `[crownprint] AUTHORIZED product "${r.match.productKey}" could not be resolved to a Wynn catalog product. ` +
          `The Hair Wellness Lab matched it, and the shopper will not see it. ` +
          `Either the catalog no longer carries it, or the two systems disagree about its key.`,
      );
      return false;
    });

  const matches: FitMatch[] = resolved
    .map(({ match: m, catalogSlug }) => {
      const product = byName.get(catalogSlug)!;
      const usage = productUsage(catalogSlug);
      const need = usage?.need ?? "Part of your resolved routine";
      const whenToUse = usage?.whenToUse ?? "Follow the directions on the product page.";
      return {
        productKey: m.productKey,
        catalogSlug,
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

  // matches is now COMPLETE. Nothing below may add to it.
  //
  // What used to sit here was a third step that walked the resolved product
  // functions, keyword-matched each label against a table of Wynn slugs, and
  // pushed the hits in as extra "good" cards. That step is gone. It meant a
  // shopper could be shown a product the Hair Wellness Lab never resolved for
  // them — a cleanser because a coverage row said `cleanse_scalp`, a bonnet
  // because one said `reduce_surface_friction` — with a rationale that sounded
  // every bit as authoritative as a real match.
  //
  // HWL decides what a CrownPrint resolves to. Wynn renders that decision.
  matches.sort((a, b) => CLASS_ORDER[a.matchClass] - CLASS_ORDER[b.matchClass] || a.methodStep - b.methodStep);

  // 2. The resolved product functions, shown as the Lab worded them.
  const functions = (context.productFunctionsNeeded ?? []).map((f) => ({
    label: f.label,
    detail: f.detail ?? "",
  }));

  // 3. Coverage — descriptive only. Three outcomes get explained: covered,
  //    partially supported, not carried. No branch of this produces a product.
  const coverage: CoveragePoint[] = (context.coverage ?? []).map((c) => ({
    functionKey: c.functionKey,
    status: c.status,
    // Display text only. functionLabel is deprecated (readable until
    // 2026-11-30); when it is absent the key is humanized for reading. Neither
    // is ever compared, matched, or selected on.
    label: c.functionLabel?.trim() || humanizeFunctionKey(c.functionKey),
    detail: c.detail ?? COVERAGE_DETAIL[c.status],
  }));

  // 4. Gaps: what HWL determined Wynn doesn't carry — from `notCarried`, and
  //    from coverage rows the Lab itself marked not_carried. Wynn no longer
  //    forms an opinion of its own about what its catalog can serve.
  const notCarriedFromCoverage = coverage
    .filter((c) => c.status === "not_carried")
    .map((c) => ({ label: c.label, detail: c.detail }));
  const gaps: LabelledPoint[] = [
    ...(context.notCarried ?? []).map((g) => ({
      label: g.label,
      detail: g.detail ?? "Your Hair Wellness Lab report identified this need, and Wynn Essentials doesn't currently make it.",
    })),
    ...notCarriedFromCoverage,
  ].filter(dedupeByLabel());

  // 5. Accessories — the separate support channel, joined to the catalog for a
  //    name only. These never enter `matches` and never render as CrownPrint
  //    product cards.
  const accessories: AccessorySupport[] = (context.accessories ?? [])
    .map((a): AccessorySupport | null => {
      const product = byName.get(a.productKey);
      if (!product) return null;
      return {
        productKey: a.productKey,
        productName: product.name,
        why: a.why ?? "Suggested by the Hair Wellness Lab as everyday support for your routine.",
      };
    })
    .filter((a): a is AccessorySupport => a !== null);

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
    coverage,
    accessories,
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
    // The fallback has no HWL context, so there is no coverage verdict and no
    // accessory channel to read. Empty, never reconstructed locally.
    coverage: [],
    accessories: [],
    gaps: fit.gaps,
    notes: fit.notes,
    noFit: fit.noFit,
    noStrongMatch: fit.noStrongMatch,
    whatToLookFor: fit.whatToLookFor,
  };
}

// ---------------------------------------------------------------------------

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Default explanation per coverage status, when HWL sent no detail of its own. */
const COVERAGE_DETAIL: Record<CoverageStatus, string> = {
  covered: "Your resolved CrownPrint calls for this, and the Wynn Essentials collection serves it.",
  partial: "Your resolved CrownPrint calls for this, and Wynn Essentials supports it in part — not as fully as a dedicated product would.",
  not_carried: "Your resolved CrownPrint calls for this, and Wynn Essentials doesn't currently make it.",
};

/**
 * Turn `reduce_surface_friction` into "Reduce surface friction" for display when
 * HWL sent no label. Presentation only — the key stays the identifier.
 */
const humanizeFunctionKey = (key: string): string => {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
};

/**
 * THE GUARD.
 *
 * Every CrownPrint product card must correspond to a product key the Hair
 * Wellness Lab actually resolved. This is the last line before render, and it
 * fails CLOSED: an unauthorized key is dropped from the page, not surfaced with
 * a warning attached. Rendering one product the Lab did not choose is worse than
 * rendering one fewer.
 *
 * `authorized` is null only when there is no trusted context at all — the
 * manual-code fallback, where Wynn's own engine is openly the author of the
 * results and there is no HWL matches array to be a subset of. Pass the real
 * array (even an empty one) whenever a context exists.
 */
export function enforceMatchesOnly<T extends { productKey: string }>(
  cards: T[],
  authorized: { productKey: string }[] | null,
): T[] {
  if (authorized === null) return cards;
  const allowed = new Set(authorized.map((m) => m.productKey));
  const kept: T[] = [];
  for (const card of cards) {
    if (allowed.has(card.productKey)) {
      kept.push(card);
      continue;
    }
    // Loud on the server, silent to the shopper. If this ever fires, some path
    // is manufacturing recommendations again and needs finding, not muting.
    console.error(
      `[crownprint] BLOCKED product card "${card.productKey}": not present in the Hair Wellness Lab matches array. ` +
        `Product cards may only come from matches — coverage and function labels never select products.`,
    );
  }
  return kept;
}

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
