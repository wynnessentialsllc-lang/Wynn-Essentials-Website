// How long after an order the scheduled customer emails go out.
//
// Both post-purchase crons — product education and the review request — wait a
// number of days that depends on real-world delivery, which nobody can read off
// the database: /admin/orders records a shipped date, and no carrier is ever
// polled for a delivery event. The defaults are therefore derived from the
// delivery window we advertise at checkout (3–7 BUSINESS days on the standard
// and free Stripe shipping rates, which is nine to eleven CALENDAR days at the
// slow end), and both are overridable from the environment so they can be tuned
// against what actually happens without a code change.

/**
 * A wait, in milliseconds, from `name` in the environment — or `fallbackDays`
 * when it is missing or unusable.
 *
 * A blank, non-numeric, zero, negative, or infinite value falls back rather
 * than resolving to "send immediately". Getting that wrong would mail every
 * customer the moment a typo reached production, and an email sent early cannot
 * be recalled — so the failure mode is deliberately "keep the default".
 */
export function envDays(name: string, fallbackDays: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  const days = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackDays;
  return days * 24 * 60 * 60 * 1000;
}
