import assert from "node:assert/strict";
import test from "node:test";
import { fallCampaignEmail, fallCampaigns } from "../lib/fall-campaign-email.ts";

test("fall campaigns are unique and ordered", () => {
  assert.equal(new Set(fallCampaigns.map(item => item.id)).size, fallCampaigns.length);
  assert.ok(fallCampaigns[0].scheduledAt < fallCampaigns[1].scheduledAt);
});

test("production emails contain compliance and approved campaign content", () => {
  for (const campaign of fallCampaigns) {
    const email = fallCampaignEmail(campaign.id, "customer@example.com");
    assert.ok(email.html.includes("Unsubscribe"));
    assert.ok(email.html.includes("Wynn Essentials, LLC"));
    assert.ok(email.text.includes("customer%40example.com"));
  }
  assert.match(fallCampaignEmail("fall-reset-2026", "customer@example.com").html, /No discount/);
  assert.match(fallCampaignEmail("national-hair-day-2026", "customer@example.com").html, /Free shipping/);
});
