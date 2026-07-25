import { NextResponse } from "next/server";
import { getDb } from "../../../db";
import { productInventory } from "../../../db/schema";

// Public: the storefront reads this to know each product's live availability.
// Rows here OVERRIDE the catalog's own soldOut flag, so `inStock` lets a
// catalog-sold-out product be reopened and `soldOut` closes an open one. Fails
// open to empty lists if the table or database is unavailable.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await getDb().select().from(productInventory);
    return NextResponse.json(
      {
        soldOut: rows.filter(r => r.soldOut).map(r => r.slug),
        inStock: rows.filter(r => !r.soldOut).map(r => r.slug),
      },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
    );
  } catch {
    return NextResponse.json({ soldOut: [], inStock: [] });
  }
}
