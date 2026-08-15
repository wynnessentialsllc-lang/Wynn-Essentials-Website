import { eq, inArray } from "drizzle-orm";
import type { getDb } from "../db";
import { subscribers } from "../db/schema";
import { products } from "../app/data";
import { notifyCustomerRestock } from "./notify";
import { emailUrl } from "./email-brand";

/**
 * The restock waitlist.
 *
 * There is no separate waitlist table: a signup is a row in `subscribers` whose
 * `source` names the product she is waiting on. That column carries the whole
 * state machine, and it has exactly three values that matter here:
 *
 *   waitlist:<slug>           — waiting to hear that <slug> is back
 *   waitlist-notified:<slug>  — already told, this cycle
 *   anything else             — not on any waitlist
 *
 * Consequence worth knowing before you read the admin view: because `email` is
 * the primary key of `subscribers` and `source` is a single column, one address
 * can sit on ONE product's waitlist at a time. Joining a second product's
 * waitlist moves her, it does not add her. See docs/restock-waitlist.md.
 */

export const WAITLIST_PREFIX = "waitlist:";
export const NOTIFIED_PREFIX = "waitlist-notified:";

/** The `source` value written when someone joins <slug>'s waitlist. */
export const waitlistSource = (slug: string) => `${WAITLIST_PREFIX}${slug}`;
/** The `source` value they are moved to once the back-in-stock email is sent. */
export const notifiedSource = (slug: string) => `${NOTIFIED_PREFIX}${slug}`;

/** Reads the slug back out of either source form; null when it is neither. */
export function slugFromSource(source: string | null | undefined): string | null {
  if (typeof source !== "string") return null;
  if (source.startsWith(WAITLIST_PREFIX)) return source.slice(WAITLIST_PREFIX.length) || null;
  if (source.startsWith(NOTIFIED_PREFIX)) return source.slice(NOTIFIED_PREFIX.length) || null;
  return null;
}

/** Display name for a product, falling back to the slug for a retired one. */
export function waitlistProductName(slug: string): string {
  const product = products.find(p => p.slug === slug);
  return product ? `${product.name} ${product.subtitle}` : slug;
}

/** Absolute product URL, resolved through the same origin rule the emails use. */
export const waitlistProductUrl = (slug: string) => emailUrl(`/products/${slug}`);

/** Live availability of a product, as the storefront and checkout compute it. */
export type InventoryState = { soldOut: boolean; stock: number | null };
/** Sold out when the flag is set or tracked stock has run to zero. */
export const isSoldOut = (state: InventoryState) => state.soldOut || (state.stock != null && state.stock <= 0);

type Db = ReturnType<typeof getDb>;

/**
 * Emails everyone currently waiting on <slug> that it is back, then moves them
 * to the notified source so a later sell-out/restock cycle starts a fresh list
 * and nobody is told twice about the same return.
 *
 * The move happens only after the sends resolve, so a crash mid-send leaves the
 * list intact and the restock can be retried from the admin view. The trade-off
 * is the other direction: a crash after some sends have landed can produce a
 * duplicate on retry. Telling her twice is the better failure than never
 * telling her at all.
 *
 * Returns how many addresses were emailed.
 */
export async function notifyRestockWaitlist(db: Db, slug: string): Promise<number> {
  const source = waitlistSource(slug);
  const waiting = await db.select({ email: subscribers.email }).from(subscribers).where(eq(subscribers.source, source)).limit(2000);
  if (waiting.length === 0) return 0;

  const productName = waitlistProductName(slug);
  const productUrl = waitlistProductUrl(slug);
  // One failed address must not hold back the rest of the list.
  await Promise.all(waiting.map(w => notifyCustomerRestock({ email: w.email, productName, productUrl }).catch(() => {})));

  // Scoped to the addresses actually read above rather than re-running the
  // predicate, so somebody who joins while the sends are in flight stays on the
  // list and is told on the next run instead of being silently marked served.
  await db.update(subscribers)
    .set({ source: notifiedSource(slug), updatedAt: new Date() })
    .where(inArray(subscribers.email, waiting.map(w => w.email)));

  return waiting.length;
}

/**
 * The automatic trigger: when an inventory edit carries a product from sold out
 * to available, tell its waitlist. Best-effort — it never throws, so it cannot
 * break the inventory update that called it.
 */
export async function notifyRestockIfReopened(db: Db, slug: string, before: InventoryState, after: InventoryState): Promise<void> {
  if (!(isSoldOut(before) && !isSoldOut(after))) return;
  try {
    await notifyRestockWaitlist(db, slug);
  } catch (error) {
    console.error("Restock notification failed", { slug, message: error instanceof Error ? error.message : "Unknown error" });
  }
}
