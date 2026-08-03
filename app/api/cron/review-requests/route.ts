import { NextResponse } from "next/server";
import { and, eq, isNull, isNotNull, lte, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { products } from "../../../data";
import { commerceConfig } from "../../../../lib/commerce-config";
import { notifyReviewRequest } from "../../../../lib/notify";

// Scheduled by Vercel Cron (see vercel.json). Emails a one-time review request
// for paid orders once the customer has had the product a little while: 7 days
// after it shipped, or — for stores that don't mark orders shipped — 14 days
// after the order was placed. Requires CRON_SECRET so it isn't publicly
// triggerable. Each order is asked at most once (review_requested_at).
export const dynamic = "force-dynamic";

const AFTER_SHIP_MS = 7 * 24 * 60 * 60 * 1000;
const AFTER_ORDER_MS = 14 * 24 * 60 * 60 * 1000;
const BATCH = 50;

type OrderItem = { productId?: string | null; name?: string | null };

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("token") === secret;
}

// Reduce an order's stored line items to the unique catalog products it can
// review, with a friendly name and a link to that product's review form.
function reviewable(items: OrderItem[]): { name: string; url: string }[] {
  const seen = new Set<string>();
  const out: { name: string; url: string }[] = [];
  for (const item of items) {
    const product = products.find(p => p.stripeProductId && p.stripeProductId === item.productId);
    const slug = product?.slug;
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ name: product?.name ?? item.name ?? "your order", url: `${commerceConfig.siteUrl}/#product-${slug}` });
  }
  return out;
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
        isNull(orders.reviewRequestedAt),
        isNotNull(orders.customerEmail),
        or(
          lte(orders.shippedAt, shipCutoff),
          and(isNull(orders.shippedAt), lte(orders.createdAt, orderCutoff)),
        ),
      ))
      .limit(BATCH);

    for (const order of eligible) {
      processed++;
      const items = (Array.isArray(order.items) ? order.items : []) as OrderItem[];
      const list = reviewable(items);
      // Mark requested regardless so a send failure (or an order with no
      // reviewable products) isn't retried forever.
      await db.update(orders).set({ reviewRequestedAt: new Date(), updatedAt: new Date() }).where(eq(orders.sessionId, order.sessionId));
      if (list.length === 0) { skipped++; continue; }
      const sent = await notifyReviewRequest({
        email: order.customerEmail!,
        customerName: order.customerName,
        orderReference: order.orderReference,
        products: list,
      });
      if (sent) emailed++;
    }

    return NextResponse.json({ ok: true, processed, emailed, skipped });
  } catch (error) {
    console.error("Review-request cron failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Cron failed." }, { status: 500 });
  }
}
