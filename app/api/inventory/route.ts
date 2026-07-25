import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { productInventory } from "../../../db/schema";

// Public: the storefront reads this to know which products are sold out. Returns
// only the slugs of sold-out products. Fails open to an empty list if the table
// or database is unavailable, so the store never breaks over inventory.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await getDb()
      .select({ slug: productInventory.slug })
      .from(productInventory)
      .where(eq(productInventory.soldOut, true));
    return NextResponse.json(
      { soldOut: rows.map(r => r.slug) },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
    );
  } catch {
    return NextResponse.json({ soldOut: [] });
  }
}
