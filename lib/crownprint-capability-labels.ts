// Shop by CrownPrint™ — customer-facing labels for HWL capability identifiers.
//
// WHY THIS EXISTS
// The Hair Wellness Lab contract carries stable machine identifiers —
// `proteins_peptides`, `reduce_surface_friction` — and it should keep carrying
// them: they are the durable join between the two systems, they survive
// rewording, and they are what an audit trail needs. None of that makes them
// customer copy. A shopper reading "Capability: proteins_peptides" is reading a
// database column, and it undermines the care taken over every other line on
// the card.
//
// So the key stays the identifier and this file supplies the words. It is a
// WYNN-ONLY presentation concern: the contract does not change, the payload does
// not change, the key travels unmodified through normalization, guidance, the
// guard and the audit endpoint, and only the final render swaps in a label.
//
// This maps identifiers to words. It does not decide what qualifies, what
// ranks, or what is authorized — nothing here can affect which products appear.

/**
 * Known capability identifiers from the HWL explanation contract (#642).
 *
 * Add an entry as the Lab introduces a capability. An unmapped key is not a
 * failure — `capabilityLabel()` degrades to a readable form below — but a
 * curated label reads better than a mechanical one, so unmapped keys are logged
 * rather than silently tolerated.
 */
export const CAPABILITY_LABELS: Record<string, string> = {
  proteins_peptides: "Protein & peptides",
};

/**
 * Turn `proteins_peptides` into "Proteins peptides" — the safety net for a key
 * that has no curated label yet. Not pretty, but never raw: no shopper sees an
 * underscore, which is the property that matters.
 */
const humanize = (key: string): string => {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
};

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
  // Server-side only, and deliberately loud: a new capability from the Lab
  // should get a proper label rather than living on the fallback forever.
  console.warn(
    `[crownprint] capability "${raw}" has no customer-facing label; showing a generated one. ` +
      `Add it to CAPABILITY_LABELS in lib/crownprint-capability-labels.ts.`,
  );
  return humanize(raw);
}
