"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { productInventory } from "../../../db/schema";
import { products } from "../../data";
import { isAuthenticated } from "../../../lib/admin-auth";
// The waitlist itself — who is waiting, what they are told, and when the list is
// cleared — lives in lib/restock-waitlist.ts, shared with /admin/waitlist.
import { notifyRestockIfReopened, type InventoryState as InvState } from "../../../lib/restock-waitlist";

const VALID_SLUGS = new Set(products.map(p => p.slug));

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
