import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { campaignDeliveries, emailCampaigns, subscribers } from "../../../../db/schema";
import { laborDayCampaignEmail, laborDayCampaigns } from "../../../../lib/labor-day-campaign-email";
import { deliverEmailBatch, SENDER } from "../../../../lib/notify";
import { canSignUnsubscribe, listUnsubscribeHeaders } from "../../../../lib/unsubscribe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const BATCH = 100;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("token") === secret;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canSignUnsubscribe()) return NextResponse.json({ error: "Unsubscribe signing is not configured; marketing send blocked." }, { status: 503 });

  const now = new Date();
  const db = getDb();
  const results: { id: string; state: string; sent?: number }[] = [];

  try {
    // Keeps upcoming campaigns visible in Admin before their send date without
    // overwriting a live campaign's progress or completed status.
    for (const campaign of laborDayCampaigns) {
      await db.insert(emailCampaigns).values({
        id: campaign.id, name: campaign.name, subject: campaign.subject,
        status: "scheduled", scheduledAt: campaign.scheduledAt,
      }).onConflictDoUpdate({
        target: emailCampaigns.id,
        set: { name: campaign.name, subject: campaign.subject, scheduledAt: campaign.scheduledAt, updatedAt: now },
      });
    }

    const audience = await db.select({ email: subscribers.email }).from(subscribers)
      .where(and(eq(subscribers.marketingConsent, true), isNull(subscribers.unsubscribedAt)))
      .limit(20000);

    for (const campaign of laborDayCampaigns) {
      if (now < campaign.scheduledAt) { results.push({ id: campaign.id, state: "scheduled" }); continue; }
      if (now >= campaign.expiresAt) { results.push({ id: campaign.id, state: "expired" }); continue; }

      const [record] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaign.id)).limit(1);
      if (record?.status === "sent" || record?.status === "attention") {
        results.push({ id: campaign.id, state: record.status }); continue;
      }

      const existing = await db.select({ email: campaignDeliveries.email }).from(campaignDeliveries)
        .where(eq(campaignDeliveries.campaignId, campaign.id)).limit(20000);
      const claimedEmails = new Set(existing.map(row => row.email));
      const pending = audience.map(row => row.email).filter(email => !claimedEmails.has(email)).slice(0, BATCH);

      if (pending.length === 0) {
        await db.update(emailCampaigns).set({ status: "sent", sentAt: record?.sentAt || now, updatedAt: now }).where(eq(emailCampaigns.id, campaign.id));
        results.push({ id: campaign.id, state: "sent", sent: 0 });
        continue;
      }

      const claimed = await db.insert(campaignDeliveries).values(pending.map(email => ({ campaignId: campaign.id, email })))
        .onConflictDoNothing()
        .returning({ email: campaignDeliveries.email });
      const emails = claimed.map(row => row.email);
      if (emails.length === 0) { results.push({ id: campaign.id, state: "overlap" }); continue; }

      await db.update(emailCampaigns).set({ status: "sending", updatedAt: now }).where(eq(emailCampaigns.id, campaign.id));
      const messages = emails.map(email => {
        const rendered = laborDayCampaignEmail(campaign.id, email);
        return { to: email, ...rendered, fromName: SENDER.campaign, headers: listUnsubscribeHeaders(email, { oneClick: true }) };
      });
      const delivery = await deliverEmailBatch(messages);

      if (!delivery.ok) {
        if (delivery.certainNotSent) {
          await db.delete(campaignDeliveries).where(and(eq(campaignDeliveries.campaignId, campaign.id), inArray(campaignDeliveries.email, emails)));
          await db.update(emailCampaigns).set({ status: "scheduled", updatedAt: new Date() }).where(eq(emailCampaigns.id, campaign.id));
        } else {
          // A timeout may have happened after Resend accepted the batch. Stop
          // rather than retrying and risking duplicates; Admin makes it visible.
          await db.update(emailCampaigns).set({ status: "attention", updatedAt: new Date() }).where(eq(emailCampaigns.id, campaign.id));
        }
        results.push({ id: campaign.id, state: delivery.certainNotSent ? "retryable" : "attention" });
        continue;
      }

      const ids = delivery.providerMessageIds || [];
      await Promise.all(emails.map((email, index) => db.update(campaignDeliveries).set({
        status: "sent", sentAt: new Date(), providerMessageId: ids[index] || null, updatedAt: new Date(),
      }).where(and(eq(campaignDeliveries.campaignId, campaign.id), eq(campaignDeliveries.email, email)))));

      if (pending.length < BATCH) {
        await db.update(emailCampaigns).set({ status: "sent", sentAt: now, updatedAt: new Date() }).where(eq(emailCampaigns.id, campaign.id));
      }
      results.push({ id: campaign.id, state: pending.length < BATCH ? "sent" : "sending", sent: emails.length });
    }

    return NextResponse.json({ ok: true, audience: audience.length, results });
  } catch (error) {
    console.error("Labor Day campaign cron failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Campaign cron failed." }, { status: 500 });
  }
}

