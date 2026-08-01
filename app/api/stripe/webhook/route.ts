import Stripe from "stripe";
import { NextResponse } from "next/server";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getStripe } from "../../../../lib/stripe";
import { getDb } from "../../../../db";
import { orders, stripeEvents, productInventory } from "../../../../db/schema";
import { products } from "../../../data";
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
  if (!(await claimEvent(db, event, sessionId))) {
    console.info("Stripe event already processed", { eventId: event.id, sessionId });
    return;
  }

  const session = await getStripe().checkout.sessions.retrieve(sessionId, {
    expand: ["line_items.data.price.product"],
  });

  const items = session.line_items?.data.map(item => ({
    priceId: item.price?.id,
    productId: typeof item.price?.product === "string" ? item.price.product : item.price?.product?.id,
    name: item.description,
    quantity: item.quantity,
    unitAmount: item.price?.unit_amount,
    totalAmount: item.amount_total,
  })) ?? [];

  const row = {
    sessionId: session.id,
    orderReference: session.metadata?.internalOrderReference ?? null,
    eventId: event.id,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    status,
    paymentStatus: session.payment_status ?? null,
    currency: session.currency ?? null,
    subtotalAmount: session.amount_subtotal ?? null,
    discountAmount: session.total_details?.amount_discount ?? null,
    shippingAmount: session.total_details?.amount_shipping ?? null,
    taxAmount: session.total_details?.amount_tax ?? null,
    totalAmount: session.amount_total ?? null,
    customerEmail: session.customer_details?.email ?? null,
    customerName: session.customer_details?.name ?? null,
    // jsonb columns take structured values directly; stringifying would store
    // the JSON as an opaque quoted string and break querying.
    shippingAddress: session.collected_information?.shipping_details ?? null,
    items,
  };

  // A session can arrive as completed and later as async_payment_failed, so the
  // session id is the primary key and the latest verified status wins.
  await db
    .insert(orders)
    .values(row)
    .onConflictDoUpdate({
      target: orders.sessionId,
      set: { status: row.status, paymentStatus: row.paymentStatus, updatedAt: new Date() },
    });

  // Only a paid order consumes stock. Runs once per event thanks to claimEvent.
  if (status === "paid") {
    await decrementStock(db, session);
    // Best-effort emails, guaranteed once per order by claimEvent above. Each is
    // wrapped so a notify failure never turns into a 500 (which Stripe retries):
    // the owner alert, and the customer's order confirmation.
    await notifyNewOrder(row).catch(() => {});
    await notifyCustomerOrderConfirmation(row).catch(() => {});
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
