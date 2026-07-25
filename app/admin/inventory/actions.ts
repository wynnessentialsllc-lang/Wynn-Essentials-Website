"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../../../db";
import { productInventory } from "../../../db/schema";
import { products } from "../../data";
import { isAuthenticated } from "../../../lib/admin-auth";

const VALID_SLUGS = new Set(products.map(p => p.slug));

export async function setSoldOut(formData: FormData) {
  // A server action is its own endpoint, so it re-checks authentication rather
  // than trusting the page that rendered it.
  if (!(await isAuthenticated())) throw new Error("Not authorized.");

  const slug = formData.get("slug");
  const soldOut = formData.get("soldOut") === "true";
  if (typeof slug !== "string" || !VALID_SLUGS.has(slug)) throw new Error("Unknown product.");

  await getDb()
    .insert(productInventory)
    .values({ slug, soldOut, updatedAt: new Date() })
    .onConflictDoUpdate({ target: productInventory.slug, set: { soldOut, updatedAt: new Date() } });

  revalidatePath("/admin/inventory");
}
