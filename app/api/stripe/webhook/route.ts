import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getStripe } from "../../../../lib/stripe";

// Replace with a durable order repository (Supabase, D1, or another database)
// before enabling live checkout. Stripe event/session IDs must have unique indexes.
async function recordOrder(sessionId: string, eventId: string, status: "paid" | "failed") {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items.data.price.product"] });
  const snapshot = {
    eventId,
    sessionId: session.id,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
    paymentStatus: session.payment_status,
    orderReference: session.metadata?.internalOrderReference,
    currency: session.currency,
    subtotalAmount: session.amount_subtotal,
    discountAmount: session.total_details?.amount_discount,
    shippingAmount: session.total_details?.amount_shipping,
    taxAmount: session.total_details?.amount_tax,
    totalAmount: session.amount_total,
    customerEmail: session.customer_details?.email,
    status,
    items: session.line_items?.data.map(item => ({ priceId: item.price?.id, productId: typeof item.price?.product === "string" ? item.price.product : item.price?.product?.id, name: item.description, quantity: item.quantity, unitAmount: item.price?.unit_amount, totalAmount: item.amount_total })),
  };
  console.info("Verified Stripe order requires durable repository", { eventId: snapshot.eventId, sessionId: snapshot.sessionId, status: snapshot.status });
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  let event: Stripe.Event;
  try { event = getStripe().webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return NextResponse.json({ error: "Invalid signature." }, { status: 400 }); }
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") await recordOrder(event.data.object.id, event.id, "paid");
    if (event.type === "checkout.session.async_payment_failed") await recordOrder(event.data.object.id, event.id, "failed");
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Verified webhook handling failed", { eventId: event.id, message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
