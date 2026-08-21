import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { campaignDeliveries, campaignEmailEvents } from "../../../../db/schema";
import { verifyResendWebhook } from "../../../../lib/resend-webhook";

export const dynamic = "force-dynamic";

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: { email_id?: string };
};

export async function POST(request: Request) {
  const payload = await request.text();
  if (!verifyResendWebhook(payload, request.headers)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: ResendEvent;
  try { event = JSON.parse(payload) as ResendEvent; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const eventId = request.headers.get("svix-id")!;
  const eventType = event.type || "unknown";
  const messageId = event.data?.email_id || null;
  const occurredAt = event.created_at && !Number.isNaN(Date.parse(event.created_at)) ? new Date(event.created_at) : new Date();
  const db = getDb();

  const claimed = await db.insert(campaignEmailEvents).values({ eventId, eventType, providerMessageId: messageId })
    .onConflictDoNothing({ target: campaignEmailEvents.eventId })
    .returning({ eventId: campaignEmailEvents.eventId });
  if (claimed.length === 0 || !messageId) return NextResponse.json({ ok: true, duplicate: claimed.length === 0 });

  const match = eq(campaignDeliveries.providerMessageId, messageId);
  if (eventType === "email.sent") {
    await db.update(campaignDeliveries).set({ status: "sent", sentAt: occurredAt, updatedAt: new Date() }).where(match);
  } else if (eventType === "email.delivered") {
    await db.update(campaignDeliveries).set({ status: "delivered", deliveredAt: occurredAt, updatedAt: new Date() }).where(match);
  } else if (eventType === "email.opened") {
    await db.update(campaignDeliveries).set({ status: "opened", openedAt: occurredAt, updatedAt: new Date() })
      .where(and(match, isNull(campaignDeliveries.openedAt)));
  } else if (eventType === "email.bounced" || eventType === "email.failed") {
    await db.update(campaignDeliveries).set({ status: "bounced", bouncedAt: occurredAt, updatedAt: new Date() }).where(match);
  } else if (eventType === "email.complained") {
    await db.update(campaignDeliveries).set({ status: "complained", complainedAt: occurredAt, updatedAt: new Date() }).where(match);
  }

  return NextResponse.json({ ok: true });
}
