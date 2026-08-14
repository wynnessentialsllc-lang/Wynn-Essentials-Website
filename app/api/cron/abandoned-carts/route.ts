import { NextResponse } from "next/server";
import { and, eq, gt, lt, gte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { abandonedCarts, orders } from "../../../../db/schema";
import { firstOrderOffer } from "../../../../lib/first-order-offer";
import { notifyAbandonedCart } from "../../../../lib/notify";

// Scheduled by Vercel Cron (see vercel.json). Emails a one-time reminder for
// carts abandoned at least ABANDON_AFTER ago, skipping anyone who has since
// placed a paid order. Requires CRON_SECRET so the endpoint isn't publicly
// triggerable — Vercel Cron sends it automatically as a Bearer token.
export const dynamic = "force-dynamic";

const ABANDON_AFTER_MS = 60 * 60 * 1000;        // wait 1h before reminding
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // ignore carts older than 30d
const BATCH = 200;

// Shape written by /api/abandoned, which enriches the raw {slug, quantity}
// lines from the catalog. `slug` is what finds the product photograph.
type CartItem = { slug?: string | null; name?: string | null; quantity?: number | null; price?: number | null };

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const token = new URL(request.url).searchParams.get("token");
  return token === secret;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const now = Date.now();
  const cutoff = new Date(now - ABANDON_AFTER_MS);
  const floor = new Date(now - MAX_WINDOW_MS);
  let emailed = 0, recovered = 0, processed = 0;

  try {
    const db = getDb();
    const pending = await db
      .select()
      .from(abandonedCarts)
      .where(and(eq(abandonedCarts.status, "pending"), lt(abandonedCarts.updatedAt, cutoff), gt(abandonedCarts.updatedAt, floor)))
      .limit(BATCH);

    for (const cart of pending) {
      processed++;
      // Skip if this email placed a paid order since the cart was last updated.
      const paid = await db
        .select({ sessionId: orders.sessionId })
        .from(orders)
        .where(and(eq(orders.customerEmail, cart.email), eq(orders.status, "paid"), gte(orders.createdAt, cart.updatedAt ?? floor)))
        .limit(1);
      if (paid.length > 0) {
        await db.update(abandonedCarts).set({ status: "recovered", updatedAt: new Date() }).where(eq(abandonedCarts.email, cart.email));
        recovered++;
        continue;
      }

      const items = (Array.isArray(cart.items) ? cart.items : []) as CartItem[];
      // Mention the welcome code only while it is actually redeemable. With the
      // promo-code field switched off at checkout the reminder still goes out,
      // just without an offer it cannot honour.
      const offer = firstOrderOffer();
      const sent = await notifyAbandonedCart({
        email: cart.email,
        items,
        subtotal: cart.subtotal,
        promoCode: offer?.code ?? null,
        promoLabel: offer?.label ?? null,
      });
      // Mark emailed regardless so a send failure isn't retried forever.
      await db.update(abandonedCarts).set({ status: "emailed", emailedAt: new Date(), updatedAt: new Date() }).where(eq(abandonedCarts.email, cart.email));
      if (sent) emailed++;
    }

    return NextResponse.json({ ok: true, processed, emailed, recovered });
  } catch (error) {
    console.error("Abandoned-cart cron failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Cron failed." }, { status: 500 });
  }
}
