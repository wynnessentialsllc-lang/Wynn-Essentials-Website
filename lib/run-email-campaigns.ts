import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { campaignDeliveries, emailCampaigns, subscribers } from "../db/schema";
import { deliverEmailBatch, SENDER } from "./notify";
import { canSignUnsubscribe, listUnsubscribeHeaders } from "./unsubscribe";

export type ScheduledCampaign<T extends string = string> = { id: T; name: string; subject: string; scheduledAt: Date; expiresAt: Date };
type RenderedCampaign = { subject: string; html: string; text: string };
const BATCH = 100;

export async function runEmailCampaigns<T extends string>(request: Request, campaigns: readonly ScheduledCampaign<T>[], render: (id: T, email: string) => RenderedCampaign) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canSignUnsubscribe()) return NextResponse.json({ error: "Unsubscribe signing is not configured; marketing send blocked." }, { status: 503 });
  const now = new Date(), db = getDb();
  const results: { id: string; state: string; sent?: number }[] = [];
  try {
    for (const campaign of campaigns) await db.insert(emailCampaigns).values({ id: campaign.id, name: campaign.name, subject: campaign.subject, status: "scheduled", scheduledAt: campaign.scheduledAt })
      .onConflictDoUpdate({ target: emailCampaigns.id, set: { name: campaign.name, subject: campaign.subject, scheduledAt: campaign.scheduledAt, updatedAt: now } });
    const audience = await db.select({ email: subscribers.email }).from(subscribers).where(and(eq(subscribers.marketingConsent, true), isNull(subscribers.unsubscribedAt))).limit(20000);
    for (const campaign of campaigns) {
      if (now < campaign.scheduledAt) { results.push({ id: campaign.id, state: "scheduled" }); continue; }
      if (now >= campaign.expiresAt) { results.push({ id: campaign.id, state: "expired" }); continue; }
      const [record] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaign.id)).limit(1);
      if (record?.status === "sent" || record?.status === "attention") { results.push({ id: campaign.id, state: record.status }); continue; }
      const existing = await db.select({ email: campaignDeliveries.email }).from(campaignDeliveries).where(eq(campaignDeliveries.campaignId, campaign.id)).limit(20000);
      const claimed = new Set(existing.map(row => row.email));
      const pending = audience.map(row => row.email).filter(email => !claimed.has(email)).slice(0, BATCH);
      if (!pending.length) { await db.update(emailCampaigns).set({ status: "sent", sentAt: record?.sentAt || now, updatedAt: now }).where(eq(emailCampaigns.id, campaign.id)); results.push({ id: campaign.id, state: "sent", sent: 0 }); continue; }
      const claimRows = await db.insert(campaignDeliveries).values(pending.map(email => ({ campaignId: campaign.id, email }))).onConflictDoNothing().returning({ email: campaignDeliveries.email });
      const emails = claimRows.map(row => row.email);
      if (!emails.length) { results.push({ id: campaign.id, state: "overlap" }); continue; }
      await db.update(emailCampaigns).set({ status: "sending", updatedAt: now }).where(eq(emailCampaigns.id, campaign.id));
      const delivery = await deliverEmailBatch(emails.map(email => ({ to: email, ...render(campaign.id, email), fromName: SENDER.campaign, headers: listUnsubscribeHeaders(email, { oneClick: true }) })));
      if (!delivery.ok) {
        if (delivery.certainNotSent) { await db.delete(campaignDeliveries).where(and(eq(campaignDeliveries.campaignId, campaign.id), inArray(campaignDeliveries.email, emails))); await db.update(emailCampaigns).set({ status: "scheduled", updatedAt: new Date() }).where(eq(emailCampaigns.id, campaign.id)); }
        else await db.update(emailCampaigns).set({ status: "attention", updatedAt: new Date() }).where(eq(emailCampaigns.id, campaign.id));
        results.push({ id: campaign.id, state: delivery.certainNotSent ? "retryable" : "attention" }); continue;
      }
      const ids = delivery.providerMessageIds || [];
      await Promise.all(emails.map((email, index) => db.update(campaignDeliveries).set({ status: "sent", sentAt: new Date(), providerMessageId: ids[index] || null, updatedAt: new Date() }).where(and(eq(campaignDeliveries.campaignId, campaign.id), eq(campaignDeliveries.email, email)))));
      if (pending.length < BATCH) await db.update(emailCampaigns).set({ status: "sent", sentAt: now, updatedAt: new Date() }).where(eq(emailCampaigns.id, campaign.id));
      results.push({ id: campaign.id, state: pending.length < BATCH ? "sent" : "sending", sent: emails.length });
    }
    return NextResponse.json({ ok: true, audience: audience.length, results });
  } catch (error) { console.error("Scheduled campaign cron failed", error instanceof Error ? error.message : "Unknown error"); return NextResponse.json({ error: "Campaign cron failed." }, { status: 500 }); }
}
