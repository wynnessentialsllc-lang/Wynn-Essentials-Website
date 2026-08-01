"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { productInventory, subscribers } from "../../../db/schema";
import { products } from "../../data";
import { isAuthenticated } from "../../../lib/admin-auth";
import { notifyCustomerRestock } from "../../../lib/notify";

const VALID_SLUGS = new Set(products.map(p => p.slug));

type InvState = { soldOut: boolean; stock: number | null };
// Mirrors the storefront/API rule: sold out when flagged or tracked stock ≤ 0.
const isOut = (s: InvState) => s.soldOut || (s.stock != null && s.stock <= 0);

// When a product crosses from sold-out to in-stock, email everyone on that
// product's restock waitlist and clear them from it so a later restock cycle
// can't re-notify the same people. Best-effort: never throws, so it can't break
// the inventory update that triggered it.
async function notifyRestockIfReopened(db: ReturnType<typeof getDb>, slug: string, before: InvState, after: InvState) {
  if (!(isOut(before) && !isOut(after))) return;
  try {
    const source = `waitlist:${slug}`;
    const waiting = await db.select({ email: subscribers.email }).from(subscribers).where(eq(subscribers.source, source)).limit(2000);
    if (waiting.length === 0) return;

    const product = products.find(p => p.slug === slug);
    const productName = product ? `${product.name} ${product.subtitle}` : slug;
    const productUrl = `https://wynnessentialsllc.us/products/${slug}`;
    await Promise.all(waiting.map(w => notifyCustomerRestock({ email: w.email, productName, productUrl }).catch(() => {})));

    // Mark them served so the next sell-out/restock cycle starts a fresh list.
    // A customer who re-joins after this resets their source back to waitlist:slug.
    await db.update(subscribers).set({ source: `waitlist-notified:${slug}`, updatedAt: new Date() }).where(eq(subscribers.source, source));
  } catch (error) {
    console.error("Restock notification failed", { slug, message: error instanceof Error ? error.message : "Unknown error" });
  }
}

export async function setSoldOut(formData: FormData) {
  // A server action is its own endpoint, so it re-checks authentication rather
  // than trusting the page that rendered it.
  if (!(await isAuthenticated())) throw new Error("Not authorized.");

  const slug = formData.get("slug");
  const soldOut = formData.get("soldOut") === "true";
  if (typeof slug !== "string" || !VALID_SLUGS.has(slug)) throw new Error("Unknown product.");

  const db = getDb();
  const [existing] = await db.select().from(productInventory).where(eq(productInventory.slug, slug)).limit(1);
  const catalogSoldOut = products.find(p => p.slug === slug)?.soldOut ?? false;
  const before: InvState = existing ? { soldOut: existing.soldOut, stock: existing.stock } : { soldOut: catalogSoldOut, stock: null };

  await db
    .insert(productInventory)
    .values({ slug, soldOut, updatedAt: new Date() })
    .onConflictDoUpdate({ target: productInventory.slug, set: { soldOut, updatedAt: new Date() } });

  // setSoldOut changes only the flag; tracked stock (if any) is preserved.
  await notifyRestockIfReopened(db, slug, before, { soldOut, stock: existing?.stock ?? null });

  revalidatePath("/admin/inventory");
}

export async function setStock(formData: FormData) {
  if (!(await isAuthenticated())) throw new Error("Not authorized.");

  const slug = formData.get("slug");
  const raw = formData.get("stock");
  if (typeof slug !== "string" || !VALID_SLUGS.has(slug)) throw new Error("Unknown product.");

  // Blank clears tracking (unlimited); a number sets the tracked count.
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  const stock = trimmed === "" ? null : Math.max(0, Math.min(1_000_000, Math.floor(Number(trimmed))));
  if (stock !== null && !Number.isFinite(stock)) throw new Error("Invalid stock value.");

  const db = getDb();
  const [existing] = await db.select().from(productInventory).where(eq(productInventory.slug, slug)).limit(1);
  const catalogSoldOut = products.find(p => p.slug === slug)?.soldOut ?? false;
  const before: InvState = existing ? { soldOut: existing.soldOut, stock: existing.stock } : { soldOut: catalogSoldOut, stock: null };

  await db
    .insert(productInventory)
    .values({ slug, stock, updatedAt: new Date() })
    .onConflictDoUpdate({ target: productInventory.slug, set: { stock, updatedAt: new Date() } });

  // setStock changes only the count; the sold-out flag (if any) is preserved.
  await notifyRestockIfReopened(db, slug, before, { soldOut: existing?.soldOut ?? false, stock });

  revalidatePath("/admin/inventory");
}
