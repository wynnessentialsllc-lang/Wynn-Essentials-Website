"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { productInventory, subscribers } from "../../../db/schema";
import { products } from "../../data";
import { isAuthenticated } from "../../../lib/admin-auth";
import { normalizeEmail } from "../../../lib/unsubscribe";
import {
  isSoldOut,
  notifyRestockWaitlist,
  waitlistSource,
  type InventoryState,
} from "../../../lib/restock-waitlist";

const VALID_SLUGS = new Set(products.map(p => p.slug));

/** Current availability of a product: the live override if there is one, otherwise the catalog. */
async function inventoryState(db: ReturnType<typeof getDb>, slug: string): Promise<InventoryState> {
  const [row] = await db.select().from(productInventory).where(eq(productInventory.slug, slug)).limit(1);
  const catalogSoldOut = products.find(p => p.slug === slug)?.soldOut ?? false;
  return row ? { soldOut: row.soldOut, stock: row.stock } : { soldOut: catalogSoldOut, stock: null };
}

// Server actions are their own endpoints, so each re-checks authentication
// rather than trusting the page that rendered the form.
async function requireAdmin() {
  if (!(await isAuthenticated())) throw new Error("Not authorized.");
}

function requireSlug(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !VALID_SLUGS.has(value)) throw new Error("Unknown product.");
  return value;
}

/**
 * Send the back-in-stock email to everyone waiting on a product, by hand.
 *
 * The automatic send fires on the sold-out → available transition in
 * /admin/inventory. This covers the cases that transition misses: stock that
 * was restored without ever being marked sold out, a send that failed halfway
 * through, or a list that grew after the product had already reopened.
 *
 * It refuses while the product is still sold out — the email says "it's back",
 * and it must not be sent to a page that will still refuse to sell.
 */
export async function notifyWaitlist(formData: FormData) {
  await requireAdmin();
  const slug = requireSlug(formData.get("slug"));

  const db = getDb();
  if (isSoldOut(await inventoryState(db, slug))) {
    throw new Error("This product is still sold out. Restock it in Inventory first — the email tells her it is back.");
  }

  await notifyRestockWaitlist(db, slug);
  revalidatePath("/admin/waitlist");
}

/**
 * Take one address off a product's waitlist, at her request or to clear a bad
 * one. Only the waiting state is removed — the row itself, and any marketing
 * consent recorded on it, is left exactly as it was.
 */
export async function removeFromWaitlist(formData: FormData) {
  await requireAdmin();
  const slug = requireSlug(formData.get("slug"));
  const raw = formData.get("email");
  const email = typeof raw === "string" ? normalizeEmail(raw) : "";
  if (!email) throw new Error("Unknown subscriber.");

  // Scoped to this product's waiting source, so a stale form cannot clear a
  // subscriber who has since moved to a different product's waitlist.
  await getDb().update(subscribers)
    .set({ source: null, updatedAt: new Date() })
    .where(and(eq(subscribers.email, email), eq(subscribers.source, waitlistSource(slug))));

  revalidatePath("/admin/waitlist");
}
