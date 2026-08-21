import Stripe from "stripe";
import { NextResponse } from "next/server";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getStripe } from "../../../../lib/stripe";
import { getDb } from "../../../../db";
import { orders, stripeEvents, productInventory, abandonedCarts } from "../../../../db/schema";
import { products } from "../../../data";
import { orderRowFromSession } from "../../../../lib/record-order";
import { notifyNewOrder, notifyCustomerOrderConfirmation } from "../../../../lib/notify";

type Db = ReturnType<typeof getDb>;

// Maps a paid line item back to our catalog slug. Regular items carry the
// catalog's Stripe product id; colored items use an inline price whose product
// metadata carries `wynn_slug`.
function slugForLineItem(item: Stripe.LineItem): string | undefined {
  const product = item.price?.product;
  if (product && typeof product === "object" && "metadata" in product) {
    const tagged = product.metadata?.wynn_slug;
    if (tagged) return tagged;
  }
  const productId = typeof product === "string" ? product : product?.id;
  return products.find(p => p.stripeProductId === productId)?.slug;
}

// Drops tracked stock by the quantity sold so we cannot oversell. Best-effort:
// a failure here is logged but never blocks the order from being acknowledged
// (the checkout-time guard is the primary protection). Untracked products
// (stock IS NULL) are left alone.
async function decrementStock(db: Db, session: Stripe.Checkout.Session) {
  for (const item of session.line_items?.data ?? []) {
    const slug = slugForLineItem(item);
    const qty = item.quantity ?? 0;
    if (!slug || qty <= 0) continue;
    try {
      await db
        .update(productInventory)
        .set({ stock: sql`GREATEST(${productInventory.stock} - ${qty}, 0)`, updatedAt: new Date() })
        .where(and(eq(productInventory.slug, slug), isNotNull(productInventory.stock)));
    } catch (error) {
      console.error("Stock decrement failed", { slug, qty, message: error instanceof Error ? error.message : "Unknown error" });
    }
  }
}

// Claims the event id. Returns false when this event was already handled, which
// is how a Stripe redelivery is prevented from writing a second order.
async function claimEvent(db: Db, event: Stripe.Event, sessionId: string) {
  const claimed = await db
    .insert(stripeEvents)
    .values({ eventId: event.id, type: event.type, sessionId })
    .onConflictDoNothing()
    .returning({ eventId: stripeEvents.eventId });
  return claimed.length > 0;
}

async function recordOrder(event: Stripe.Event, sessionId: string, status: "paid" | "failed") {
  const db = getDb();

  const session = await getStripe().checkout.sessions.retrieve(sessionId, {
    expand: ["line_items.data.price.product"],
  });
  const row = orderRowFromSession(session, event.id, status);

  // Write the order first and unconditionally. It is keyed by the checkout
  // session id, so this is idempotent: a Stripe redelivery (or the reconcile
  // backfill) updates the same row instead of creating a second order, and a
  // session that arrives completed and later async_payment_failed simply lets
  // the latest verified status win. Doing this before the event claim is what
  // guarantees a paid order is never stranded — if anything below fails, the
  // order is already recorded and the retry re-runs this same safe upsert.
  await db
    .insert(orders)
    .values(row)
    .onConflictDoUpdate({
      target: orders.sessionId,
      set: { status: row.status, paymentStatus: row.paymentStatus, updatedAt: new Date() },
    });

  // The once-only side effects (stock, emails) are gated behind claiming the
  // event id, so a Stripe redelivery re-records the order harmlessly but never
  // decrements stock twice or emails the customer twice. claimEvent returns
  // true only the first time this event id is seen.
  if (status === "paid" && (await claimEvent(db, event, sessionId))) {
    await decrementStock(db, session);
    // Best-effort emails. Each is wrapped so a notify failure never turns into a
    // 500 (which Stripe retries): the owner alert, and the customer confirmation.
    await notifyNewOrder(row).catch(() => {});
    const isPreorder = row.items.some(item => item.name?.includes("PRE-ORDER"));
    if (isPreorder) {
      const claimedAt = new Date();
      const claimed = await db.update(orders).set({ preorderConfirmationEmailedAt: claimedAt, updatedAt: claimedAt })
        .where(and(eq(orders.sessionId, sessionId), isNull(orders.preorderConfirmationEmailedAt)))
        .returning({ sessionId: orders.sessionId });
      if (claimed.length > 0) {
        const sent = await notifyCustomerOrderConfirmation(row).catch(() => false);
        if (!sent) await db.update(orders).set({ preorderConfirmationEmailedAt: null }).where(eq(orders.sessionId, sessionId));
      }
    } else {
      await notifyCustomerOrderConfirmation(row).catch(() => {});
    }
    // Close out any abandoned-cart snapshot for this buyer so no reminder is
    // sent after they've purchased.
    if (row.customerEmail) {
      try { await db.update(abandonedCarts).set({ status: "recovered", updatedAt: new Date() }).where(eq(abandonedCarts.email, row.customerEmail)); } catch {}
    }
  }

  console.info("Recorded Stripe order", { eventId: event.id, sessionId: session.id, status, orderReference: row.orderReference });
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  let event: Stripe.Event;
  try { event = getStripe().webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return NextResponse.json({ error: "Invalid signature." }, { status: 400 }); }
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") await recordOrder(event, event.data.object.id, "paid");
    if (event.type === "checkout.session.async_payment_failed") await recordOrder(event, event.data.object.id, "failed");
    return NextResponse.json({ received: true });
  } catch (error) {
    // Returning 500 makes Stripe retry, so an order is never acknowledged unless it was stored.
    console.error("Verified webhook handling failed", { eventId: event.id, message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
