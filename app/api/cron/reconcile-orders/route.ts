import { NextResponse } from "next/server";
import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { getStripe } from "../../../../lib/stripe";
import { orderRowFromSession } from "../../../../lib/record-order";

// Safety net for the Stripe webhook. If a checkout.session.completed delivery is
// ever missed or fails, the paid order would never reach the database and would
// be invisible in /admin/orders and analytics. This job lists recent Checkout
// Sessions and records any paid one that isn't already an order, so a dropped
// webhook self-heals instead of silently losing the sale.
//
// Recording only: it does not send customer emails or adjust stock (those are
// the webhook's once-only side effects). Scheduled by Vercel Cron (see
// vercel.json) and also triggerable by hand with ?token=CRON_SECRET. Requires
// CRON_SECRET so it isn't publicly triggerable.
export const dynamic = "force-dynamic";

// How many of the most recent Checkout Sessions to scan per run. Comfortably
// covers any recent webhook drop for a store of this size.
const LOOKBACK = 100;

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

  try {
    const db = getDb();
    const stripe = getStripe();

    const sessions = await stripe.checkout.sessions.list({ limit: LOOKBACK });
    const paid = sessions.data.filter(s => s.status === "complete" && s.payment_status === "paid");

    const existing = new Set((await db.select({ id: orders.sessionId }).from(orders)).map(r => r.id));
    const missing = paid.filter(s => !existing.has(s.id));

    let recovered = 0;
    const recoveredRefs: string[] = [];
    for (const summary of missing) {
      // Re-retrieve with line items expanded so the recorded order carries its
      // products, exactly like the webhook path.
      const session = await stripe.checkout.sessions.retrieve(summary.id, { expand: ["line_items.data.price.product"] });
      const row = orderRowFromSession(session, `reconciled:${session.id}`, "paid");
      // onConflictDoNothing so a race with a live webhook never overwrites a row
      // the webhook just wrote (and its fulfillment fields).
      const inserted = await db
        .insert(orders)
        .values(row)
        .onConflictDoNothing({ target: orders.sessionId })
        .returning({ id: orders.sessionId });
      if (inserted.length) {
        recovered++;
        recoveredRefs.push(row.orderReference ?? session.id);
      }
    }

    if (recovered > 0) console.warn("Order reconcile recovered missed orders", { recovered, recoveredRefs });
    return NextResponse.json({ ok: true, scanned: paid.length, recovered, recoveredRefs });
  } catch (error) {
    console.error("Order reconcile cron failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Reconcile failed." }, { status: 500 });
  }
}
