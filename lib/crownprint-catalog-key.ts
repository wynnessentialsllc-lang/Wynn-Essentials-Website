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
 * The frozen Hair Wellness Lab product vocabulary (HWL PR #640), mapped to Wynn
 * catalog slugs.
 *
 * This is the canonical contract between the two systems, written out rather
 * than inferred. Relying on the product-name fallback for these would be
 * fragile in both directions: `therapi` never matches "ThairaP", `hydrateMist`
 * never matches "Hydrate", and even the three that happen to match by name
 * today (`lathyr`, `uplyft`, `revaivl`) would silently break the moment a
 * product is renamed for merchandising reasons. An alias is a promise; a name
 * collision is a coincidence.
 *
 * Every entry is an EXACT key mapping to EXACTLY ONE slug. Never a pattern,
 * never a category, never a need. Adding a regex here would reintroduce the
 * bypass this whole contract exists to prevent.
 */
export const HWL_PRODUCT_KEY_ALIASES: Record<string, string> = {
  hydrateMist: "hydrate-herbal-hair-mist",
  therapi: "thairap-moisture-styling-cream",
  lathyr: "lathyr-shampoo",
  uplyft: "uplyft-conditioner",
  revaivl: "revaivl-protein-conditioner",
  nourishOil: "nourish-oil",
  growOil: "grow-oil",
  reliefOil: "relief-oil",
  scrunchieSet: "heritage-hold-scrunchie-set",
  edgeControl: "edge-control",
  softLifeBonnet: "soft-life-bonnet",
};

/**
 * Every product key HWL may send, frozen at eleven (HWL PR #640).
 *
 * All eleven carry an explicit alias above. That is the requirement, not a
 * coincidence: the completeness test rejects a canonical key that resolves only
 * through the product-name fallback, so the integration can never come to
 * depend on a display name. HWL's vocabulary is uniformly camelCase — including
 * `edgeControl` and `softLifeBonnet`, which look like Wynn slugs in hyphenated
 * form but are not what the Lab sends.
 */
export const HWL_CANONICAL_PRODUCT_KEYS: readonly string[] = [
  "hydrateMist",
  "therapi",
  "lathyr",
  "uplyft",
  "revaivl",
  "nourishOil",
  "growOil",
  "reliefOil",
  "scrunchieSet",
  "edgeControl",
  "softLifeBonnet",
];

// Aliases are declared in HWL's own casing so this file reads as the contract
// it mirrors, and indexed case-insensitively so lookup does not depend on it.
const ALIAS_INDEX = new Map(
  Object.entries(HWL_PRODUCT_KEY_ALIASES).map(([key, slug]) => [key.toLowerCase(), slug]),
);

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

  const alias = ALIAS_INDEX.get(lower);
  if (alias) {
    const aliased = catalog.find((p) => p.slug === alias);
    if (aliased) return aliased.slug;
    // A contract alias pointing at a product the catalog no longer carries is a
    // configuration error, not a shopper's problem — say so rather than falling
    // through to the name fallback and resolving to something else.
    console.error(
      `[crownprint] HWL alias "${lower}" maps to "${alias}", which is not in the Wynn catalog. ` +
        `The alias table and the catalog have diverged.`,
    );
    return null;
  }

  const key = normalize(raw);
  const byName = catalog.filter((p) => normalize(p.name) === key);
  if (byName.length === 1) return byName[0].slug;

  return null;
}
