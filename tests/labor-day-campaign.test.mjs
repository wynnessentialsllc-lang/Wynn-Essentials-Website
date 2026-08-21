import assert from "node:assert/strict";
import test from "node:test";
import { laborDayCampaignEmail, laborDayCampaigns } from "../lib/labor-day-campaign-email.ts";

process.env.UNSUBSCRIBE_SECRET = "labor-day-test-secret";
const email = "subscriber@example.com";

test("all three campaigns are scheduled for 9 AM Pacific on the approved dates", () => {
  assert.deepEqual(laborDayCampaigns.map(c => c.scheduledAt.toISOString()), [
    "2026-09-01T16:00:00.000Z", "2026-09-04T16:00:00.000Z", "2026-09-07T16:00:00.000Z",
  ]);
});

test("campaigns use approved offers and destinations", () => {
  const reset = laborDayCampaignEmail("labor-day-2026-reset", email);
  const shipping = laborDayCampaignEmail("labor-day-2026-free-shipping", email);
  const final = laborDayCampaignEmail("labor-day-2026-final-hours", email);
  assert.match(reset.html, /products\/hair-wellness-bundle/);
  assert.doesNotMatch(reset.html, /LABORDAY20|% OFF|Free shipping/i);
  assert.match(shipping.html, /Free shipping/i);
  assert.match(shipping.html, /Choose Uplyft or Revaivl/);
  assert.match(final.html, /LABORDAY20/);
  assert.match(final.html, /20.*% OFF/s);
});

test("every campaign is email-safe, production-linked, and unsubscribable", () => {
  for (const campaign of laborDayCampaigns) {
    const rendered = laborDayCampaignEmail(campaign.id, email);
    assert.match(rendered.html, /https:\/\/wynnessentialsllc\.us/);
    assert.match(rendered.html, /\/unsubscribe\?e=subscriber%40example\.com&amp;?t=|\/unsubscribe\?e=subscriber%40example\.com&t=/);
    assert.doesNotMatch(rendered.html, /localhost|\.vercel\.app|\.(webp|avif)["?]/i);
    assert.match(rendered.text, /Unsubscribe:/);
  }
});
