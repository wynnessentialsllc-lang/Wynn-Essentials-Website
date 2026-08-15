import { and, eq, inArray, isNull } from "drizzle-orm";
import type { getDb } from "../db";
import { productWaitlist } from "../db/schema";
import { products } from "../app/data";
import { notifyCustomerRestock } from "./notify";
import { emailUrl } from "./email-brand";

/**
 * The restock waitlist.
 *
 * One row per (address, product) in `product_waitlist`, so an address can wait
 * on as many products as she likes. `notified_at` is the state: NULL means
 * still waiting, a timestamp means she has been told about that product's
 * return. Re-joining after a later sell-out clears it, so each restock cycle
 * notifies a fresh list.
 *
 * `subscribers.source` still records 'waitlist:<slug>' as the PROVENANCE of a
 * contact — where she came from — but nothing reads it back as membership.
 * See docs/restock-waitlist.md.
 */

/** The `source` value recorded on the subscriber row a waitlist signup creates. */
export const waitlistSource = (slug: string) => `waitlist:${slug}`;

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
 * Emails everyone still waiting on <slug> that it is back, then stamps them
 * notified so nobody is told twice about the same return.
 *
 * The stamp happens only after the sends resolve, so a crash mid-send leaves
 * the list intact and the restock can be retried from /admin/waitlist. The
 * trade-off runs the other way: a crash after some sends have landed can
 * produce a duplicate on retry. Telling her twice is the better failure than
 * never telling her at all.
 *
 * Returns how many addresses were emailed.
 */
export async function notifyRestockWaitlist(db: Db, slug: string): Promise<number> {
  const waiting = await db.select({ email: productWaitlist.email })
    .from(productWaitlist)
    .where(and(eq(productWaitlist.slug, slug), isNull(productWaitlist.notifiedAt)))
    .limit(2000);
  if (waiting.length === 0) return 0;

  const productName = waitlistProductName(slug);
  const productUrl = waitlistProductUrl(slug);
  // One failed address must not hold back the rest of the list.
  await Promise.all(waiting.map(w => notifyCustomerRestock({ email: w.email, productName, productUrl }).catch(() => {})));

  // Scoped to the addresses actually read rather than re-running the predicate,
  // so somebody who joins while the sends are in flight stays on the list and is
  // told on the next run instead of being silently marked served.
  await db.update(productWaitlist)
    .set({ notifiedAt: new Date() })
    .where(and(eq(productWaitlist.slug, slug), inArray(productWaitlist.email, waiting.map(w => w.email))));

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
