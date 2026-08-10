// Shop by CrownPrint™ — customer-facing labels for HWL capability identifiers.
//
// WHY THIS EXISTS
// The Hair Wellness Lab contract carries stable machine identifiers —
// `proteins_peptides`, `cationic_conditioners` — and it should keep carrying
// them: they are the durable join between the two systems, they survive
// rewording, and an audit trail needs them. None of that makes them customer
// copy. A shopper reading "Capability: proteins_peptides" is reading a database
// column, and it undermines the care taken over every other line on the card.
//
// So the key stays the identifier and this file supplies the words. It is a
// WYNN-ONLY presentation concern: the contract does not change, the payload does
// not change, the key travels unmodified through normalization, guidance, the
// guard and the audit endpoint, and only the final render swaps in a label.
//
// This maps identifiers to words. It does not decide what qualifies, what
// ranks, or what is authorized — nothing here can affect which products appear.
//
// ---------------------------------------------------------------------------
// PROVENANCE OF THIS VOCABULARY — read before adding to it.
//
// The complete HWL #642 capability vocabulary is NOT available in this
// repository. There are no #642 fixtures, no contract dump, and no resolver
// output here; the only `capabilityKey` values present anywhere in the tree are
// Wynn's own test fixtures. The keys below are therefore the ones Wynn has been
// told about explicitly, and nothing else.
//
// Do not extend this list by guessing at plausible formulation categories. A
// wrong key never fires (so it is dead weight) and a plausible-but-wrong label
// is worse than an honest gap: `unlabeledCapabilities` in the audit exists
// precisely so an unknown key announces itself from production instead of being
// pre-empted with an invention. Add an entry when HWL confirms the key.
// ---------------------------------------------------------------------------

/**
 * Every capability identifier Wynn currently knows HWL can emit through
 * `evidence.capabilityKey`.
 *
 * The list and the label map must agree exactly, in both directions — a
 * canonical key with no label would fall through to the defensive fallback in
 * production, and a label with no canonical key is a guess. Tests enforce both.
 */
export const HWL_CANONICAL_CAPABILITY_KEYS: readonly string[] = [
  "proteins_peptides",
  "cationic_conditioners",
  "fatty_alcohols",
  "surfactants",
  "humectants",
];

/**
 * Customer-facing copy for each canonical capability.
 *
 * House style: name the ingredient family and the job it does, in the
 * vocabulary of the evidence model. These describe what a class of ingredients
 * IS, never what a finished product achieves — "Cleansing surfactants" is a
 * description; "removes buildup" would be a performance claim, and performance
 * claims are not Wynn's to make.
 */
export const CAPABILITY_LABELS: Record<string, string> = {
  proteins_peptides: "Protein & peptides",
  cationic_conditioners: "Conditioning & slip",
  fatty_alcohols: "Softening fatty alcohols",
  surfactants: "Cleansing surfactants",
  humectants: "Water-attracting humectants",
};

/**
 * DEFENSIVE ONLY — never the expected production path.
 *
 * Turns `humidity_resistance_barrier` into "Humidity resistance barrier" so an
 * unexpected key still cannot reach a customer as raw snake_case. Every
 * canonical key has real copy above; anything arriving here is either new from
 * HWL or malformed, and both cases want a human's attention rather than a
 * silent mechanical rendering that reads almost-right forever.
 */
const defensiveLabel = (key: string): string => {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
};

/** True when Wynn has deliberate copy for this capability. */
export const hasCapabilityLabel = (key: string | null | undefined): boolean =>
  Boolean(key && Object.prototype.hasOwnProperty.call(CAPABILITY_LABELS, key.trim().toLowerCase()));

/**
 * The customer-facing label for a capability identifier.
 *
 * Never returns the raw key. Pass the key itself anywhere an identifier is
 * wanted — this is for reading, not for keying.
 */
export function capabilityLabel(key: string | null | undefined): string | null {
  const raw = (key ?? "").trim();
  if (!raw) return null;

  const mapped = CAPABILITY_LABELS[raw.toLowerCase()];
  if (mapped) return mapped;

  // Server-side, and at error level rather than warn: a capability with no
  // deliberate copy is a content gap a shopper is already looking at. The audit
  // reports the same thing as `unlabeledCapabilities`.
  console.error(
    `[crownprint] capability "${raw}" has no customer-facing label; falling back to a generated one. ` +
      `Add deliberate copy to CAPABILITY_LABELS in lib/crownprint-capability-labels.ts.`,
  );
  return defensiveLabel(raw);
}
