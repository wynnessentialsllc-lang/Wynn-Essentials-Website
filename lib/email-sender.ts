// Who each email says it is from.
//
// Every message used to arrive as plain "Wynn Essentials", so an order
// confirmation, a shipping notice, and a marketing welcome were
// indistinguishable in an inbox until they were opened. Each one now carries a
// display name that says which of those it is.
//
// ONLY THE DISPLAY NAME CHANGES. The address is whatever NOTIFY_FROM is
// configured with, untouched — a different local part (orders@, reviews@) would
// have to be verified in Resend before it could send at all, and every one of
// these would start bouncing the moment it was introduced. Mailbox providers
// thread and reputation-score on the address, not the label, so this is free:
// no DNS, no verification, no deliverability cost.
//
// Keep the names short. A phone shows roughly 25–30 characters of a sender
// before truncating, and the part that gets cut is the end — which here is the
// part doing the work.

/**
 * The sender name for each kind of message. One place to edit, so a rename
 * lands everywhere at once and no message can quietly keep an old one.
 */
export const SENDER = {
  /** Paid-order receipt. */
  confirmation: "Wynn Essentials Confirmation",
  /** Shipping notice with tracking. */
  shipping: "Wynn Essentials Shipping",
  /** Post-purchase "how to use what you bought". */
  care: "Wynn Essentials Care",
  /** Post-purchase review request. */
  review: "Wynn Essentials Review",
  /** Welcomes: The Wynn Edit, the first-order offer, a restock waitlist join. */
  welcome: "Wynn Essentials Welcome",
  /** Scheduled newsletters and seasonal promotional campaigns. */
  campaign: "The Wynn Edit",
  /** A waitlisted product coming back into stock. */
  restock: "Wynn Essentials Restock",
  /** Abandoned-cart reminder. */
  bag: "Wynn Essentials Bag",
  /** Owner alerts. Never sent to a customer. */
  alerts: "Wynn Essentials Alerts",
} as const;

export type SenderName = typeof SENDER[keyof typeof SENDER];

const DEFAULT_FROM = "Wynn Essentials <onboarding@resend.dev>";

/**
 * The bare address out of a From value, which may be either
 * `Name <someone@example.com>` or `someone@example.com`.
 */
function addressOf(from: string): string | null {
  const angled = from.match(/<([^>]+)>/);
  const candidate = (angled ? angled[1] : from).trim();
  return /^[^\s<>,;"]+@[^\s<>,;"]+\.[a-z]{2,}$/i.test(candidate) ? candidate : null;
}

/**
 * A display name safe to put in a header. Anything that could break the header
 * or forge a second one — quotes, angle brackets, commas, semicolons, colons,
 * and above all CR/LF — is stripped rather than escaped, because these names are
 * ours and none of them needs those characters.
 */
function safeName(name: string): string {
  return name.replace(/[\r\n"<>,;:]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The From header for one kind of message: the configured address, wearing the
 * name for that message.
 *
 * Falls back to the configured value untouched when it cannot be parsed, so a
 * malformed NOTIFY_FROM degrades to today's behaviour rather than to a header
 * this function invented.
 */
export function fromHeader(name?: string): string {
  const configured = (process.env.NOTIFY_FROM || DEFAULT_FROM).trim();
  const address = addressOf(configured);
  if (!address) return configured;
  const label = safeName(name ?? "");
  return label ? `${label} <${address}>` : configured;
}
