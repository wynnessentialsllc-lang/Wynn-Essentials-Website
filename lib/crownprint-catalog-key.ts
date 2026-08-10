// Shop by CrownPrint™ — resolving an HWL product key to a Wynn catalog slug.
//
// WHY THIS EXISTS
// The two systems name the same product differently. The Hair Wellness Lab
// resolves `revaivl`; the Wynn catalog slug is `revaivl-protein-conditioner`.
// Before this module, the join was a bare `catalog.has(m.productKey)` that
// silently dropped anything whose spelling did not match exactly — so a shopper
// with a correctly authorized CrownPrint saw an empty results page, and nothing
// anywhere said why.
//
// WHAT THIS IS NOT
// This is NOT the retired function-label lookup coming back, and the difference
// is the whole point:
//
//   retired:  a NEED ("cleanse_scalp") selected a product Wynn happened to sell.
//             That manufactured authorization out of a description.
//   this:     an already-AUTHORIZED product, named by HWL in its own vocabulary,
//             is matched to the catalog row that IS that product. No new product
//             enters the result; one that HWL already chose stops being lost.
//
// Every rule here is therefore EXACT and ONE-TO-ONE. No regex, no substring, no
// "closest match", no category. Ambiguity fails closed and returns null, because
// showing the wrong product is worse than showing none. Authorization still
// comes from `matches` alone, and `enforceMatchesOnly()` still compares HWL's
// key — this module only answers "which catalog row is that?".

import type { FitCatalogProduct } from "./crownprint-fit";

/**
 * Explicit overrides, for keys that match neither a slug nor a product name.
 *
 * Deliberately empty at present: the observed HWL convention is the product's
 * own name, which resolves automatically below and cannot go stale as the
 * catalog changes. Add an entry here only for a genuine exception, and only as
 * an exact key mapping to exactly one slug — never a pattern.
 */
export const HWL_PRODUCT_KEY_ALIASES: Record<string, string> = {};

/** Trim, lowercase, and treat separators as spaces. Nothing fuzzier than that. */
const normalize = (value: string): string =>
  value.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");

/**
 * The Wynn catalog slug for an HWL product key, or null when it cannot be
 * resolved to exactly one product.
 *
 * Order is strict-to-loose, and every step is an equality test:
 *
 *   1. the key IS a catalog slug            ("edge-control")
 *   2. an explicit curated alias            (exceptions only; none today)
 *   3. the key IS a product name            ("revaivl" → Revaivl)
 *
 * Step 3 requires a UNIQUE name match. Two products normalizing to the same
 * name resolve to neither — a coin flip between real products is not a thing
 * this may do.
 */
export function resolveCatalogSlug(
  productKey: string | null | undefined,
  catalog: FitCatalogProduct[],
): string | null {
  const raw = (productKey ?? "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const bySlug = catalog.find((p) => p.slug.toLowerCase() === lower);
  if (bySlug) return bySlug.slug;

  const alias = HWL_PRODUCT_KEY_ALIASES[lower];
  if (alias) {
    const aliased = catalog.find((p) => p.slug === alias);
    if (aliased) return aliased.slug;
  }

  const key = normalize(raw);
  const byName = catalog.filter((p) => normalize(p.name) === key);
  if (byName.length === 1) return byName[0].slug;

  return null;
}
