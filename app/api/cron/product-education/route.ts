import { NextResponse } from "next/server";
import { and, eq, isNull, isNotNull, lte, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { commerceConfig } from "../../../../lib/commerce-config";
import { educationFor } from "../../../../lib/product-education";
import { notifyProductEducation } from "../../../../lib/notify";

// Scheduled by Vercel Cron (see vercel.json). Sends each paid order one
// education email — what every product in it is, what it does, and when to
// reach for it — timed to land a day or two after the order should have
// arrived. Requires CRON_SECRET so it isn't publicly triggerable.
export const dynamic = "force-dynamic";

// WHEN "A DAY OR TWO AFTER IT ARRIVES" ACTUALLY IS
//
// Nothing in this system knows when a parcel was delivered: /admin/orders
// records a tracking number and a shipped date, and lib/carrier-tracking.ts
// only builds a link out of them — no carrier is ever polled for a delivery
// event. So delivery is estimated, and the estimate is deliberately generous:
// an email that lands a day late reads as thoughtful, one that lands while the
// parcel is still in transit reads as automated.
//
//   SHIPPED     five days after it shipped — roughly three days of domestic
//               transit, plus the day or two of having it before it is useful
//               to be told what it is.
//   NOT SHIPPED ten days after the order, for orders that never get marked
//               shipped in the admin.
//
// Both land before the review request (7 days after shipping, 14 after the
// order), which is the right order: learn what you bought, then be asked what
// you thought of it.
const AFTER_SHIP_MS = 5 * 24 * 60 * 60 * 1000;
const AFTER_ORDER_MS = 10 * 24 * 60 * 60 * 1000;
const BATCH = 50;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("token") === secret;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const now = Date.now();
  const shipCutoff = new Date(now - AFTER_SHIP_MS);
  const orderCutoff = new Date(now - AFTER_ORDER_MS);
  let processed = 0, emailed = 0, skipped = 0;

  try {
    const db = getDb();
    const eligible = await db
      .select()
      .from(orders)
      .where(and(
        eq(orders.status, "paid"),
        isNull(orders.educationSentAt),
        isNotNull(orders.customerEmail),
        or(
          lte(orders.shippedAt, shipCutoff),
          and(isNull(orders.shippedAt), lte(orders.createdAt, orderCutoff)),
        ),
      ))
      .limit(BATCH);

    for (const order of eligible) {
      processed++;
      // Claim the order before composing anything. The WHERE clause IS the
      // claim: only the run that flips it from NULL gets a row back, so two
      // overlapping runs can never both send to the same customer. Claimed even
      // when there is nothing to say (below), so an order of products with no
      // education written for them isn't reconsidered on every run forever.
      const claimed = await db
        .update(orders)
        .set({ educationSentAt: new Date(), updatedAt: new Date() })
        .where(and(eq(orders.sessionId, order.sessionId), isNull(orders.educationSentAt)))
        .returning({ sessionId: orders.sessionId });
      if (claimed.length === 0) { skipped++; continue; }

      const items = (Array.isArray(order.items) ? order.items : []) as { productId?: string | null }[];
      const cards = educationFor(items, commerceConfig.siteUrl);
      if (cards.length === 0) { skipped++; continue; }

      const delivery = await notifyProductEducation({
        email: order.customerEmail!,
        customerName: order.customerName,
        orderReference: order.orderReference,
        cards,
      });
      if (delivery.ok) { emailed++; continue; }

      // Release the claim only when we KNOW nothing was transmitted — no API
      // key, or an explicit rejection — so a configuration problem can be fixed
      // and picked up on the next run. A send that merely timed out keeps its
      // claim, because it may well have been delivered.
      if (delivery.certainNotSent) {
        await db.update(orders).set({ educationSentAt: null }).where(eq(orders.sessionId, order.sessionId)).catch(() => {});
      }
      skipped++;
    }

    return NextResponse.json({ ok: true, processed, emailed, skipped });
  } catch (error) {
    console.error("Product-education cron failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Cron failed." }, { status: 500 });
  }
}
