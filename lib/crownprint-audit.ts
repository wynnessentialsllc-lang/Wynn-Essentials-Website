// Shop by CrownPrint™ — observational audit of the routine channel.
//
// STRICTLY OBSERVATIONAL. This module compares what HWL sent against what the
// page produced and reports the difference. It never recomputes, repairs,
// re-orders or generates a routine: if the pipeline is wrong, the audit's job is
// to SAY so, not to quietly correct it and hide the defect. A verifier that
// fixes what it finds cannot detect anything.
//
// Pure and dependency-free (no React, no next/*, no env) so it is directly
// unit-testable — see tests/crownprint-golden-matrix.test.mjs.

import { resolveCatalogSlug } from "./crownprint-catalog-key";
import type { FitCatalogProduct } from "./crownprint-fit";
import type { RoutineStatus, RoutineStep } from "./crownprint-guidance";

/** The routine as HWL sent it, post-boundary. */
export type RawRoutineStep = { order: number; productKey: string };

export type RoutineAudit = {
  routineStatus: RoutineStatus | null;
  routineStepCount: number;
  routineProductKeys: string[];
  routineCatalogSlugs: string[];
  routineOrders: number[];
  /** Sent by HWL in the routine but not rendered — an identity failure. */
  routineUnresolvedKeys: string[];
  /** Present only for a built routine; null otherwise. */
  checks: RoutineChecks | null;
  /** True when routineStatus is not_built — the builder CTA is on screen. */
  ctaActive: boolean;
};

export type RoutineChecks = {
  /** Rendered order equals HWL's, and is strictly ascending. */
  ordersPreserved: boolean;
  /** Every rendered step's slug is what the canonical bridge resolves. */
  allResolveThroughBridge: boolean;
  /** No rendered step exists that HWL did not send in routine[]. */
  noStepFromCoverage: boolean;
  /** No routine-only product reached the product cards. */
  matchesUnaltered: boolean;
};

/**
 * Audit the routine channel for one request.
 *
 * @param routineStatus  as resolved at the boundary
 * @param sent           context.routine — what HWL sent, post-boundary
 * @param rendered       guidance.routine — what the page produced
 * @param renderedMatchKeys  the product keys actually on the page as cards
 * @param authorizedKeys     context.matches[].productKey
 */
export function auditRoutine({
  routineStatus,
  sent,
  rendered,
  renderedMatchKeys,
  authorizedKeys,
  catalog,
}: {
  routineStatus?: RoutineStatus;
  sent: RawRoutineStep[];
  rendered: RoutineStep[];
  renderedMatchKeys: string[];
  authorizedKeys: string[];
  catalog: FitCatalogProduct[];
}): RoutineAudit {
  const routineProductKeys = rendered.map((r) => r.productKey);
  const renderedKeySet = new Set(routineProductKeys);

  const base = {
    routineStatus: routineStatus ?? null,
    routineStepCount: rendered.length,
    routineProductKeys,
    routineCatalogSlugs: rendered.map((r) => r.catalogSlug),
    routineOrders: rendered.map((r) => r.order),
    // Sent but not rendered. Non-empty means a step the shopper built is
    // missing from their own regimen — the routine channel's version of the
    // authorized-but-unresolved failure.
    routineUnresolvedKeys: sent.map((s) => s.productKey).filter((k) => !renderedKeySet.has(k)),
    ctaActive: routineStatus === "not_built",
  };

  // Only a built routine has anything to check. For not_built and unavailable
  // the assertion is simply that no steps exist, which routineStepCount states.
  if (routineStatus !== "built") return { ...base, checks: null };

  const sentKeys = sent.map((s) => s.productKey);
  const sentSet = new Set(sentKeys);

  // ORDER. Two independent properties, both required:
  //   1. the rendered sequence is the sequence HWL sent
  //   2. the order values are strictly ascending
  // Checking only (2) would pass a page that dropped a step; checking only (1)
  // would pass duplicated or equal order values.
  const sequenceMatches =
    routineProductKeys.length === sentKeys.length &&
    routineProductKeys.every((k, i) => k === sentKeys[i]);
  const strictlyAscending = base.routineOrders.every((o, i) => i === 0 || o > base.routineOrders[i - 1]);
  const ordersPreserved = sequenceMatches && strictlyAscending;

  // IDENTITY. Every rendered slug must be exactly what the canonical bridge
  // resolves — not a slug arrived at some other way.
  const allResolveThroughBridge = rendered.every(
    (r) => r.catalogSlug === resolveCatalogSlug(r.productKey, catalog),
  );

  // PROVENANCE. A rendered step that HWL never sent in routine[] came from
  // somewhere else — coverage, capability, catalog similarity. Nothing may
  // manufacture a routine step.
  const noStepFromCoverage = routineProductKeys.every((k) => sentSet.has(k));

  // ISOLATION. A product that is only in the routine must not have become a
  // product card. Being in a regimen is not authorization.
  const authorized = new Set(authorizedKeys);
  const matchesUnaltered = renderedMatchKeys.every(
    (k) => authorized.has(k) || !renderedKeySet.has(k),
  );

  return {
    ...base,
    checks: { ordersPreserved, allResolveThroughBridge, noStepFromCoverage, matchesUnaltered },
  };
}
