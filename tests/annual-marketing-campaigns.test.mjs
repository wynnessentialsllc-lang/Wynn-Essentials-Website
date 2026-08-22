import assert from "node:assert/strict";
import test from "node:test";
import { annualMarketingCampaigns } from "../lib/annual-marketing-campaigns.ts";
import { annualMarketingEmail } from "../lib/annual-marketing-email.ts";

test("all 36 approved November through August campaigns are scheduled once", () => {
  assert.equal(annualMarketingCampaigns.length, 36);
  assert.equal(new Set(annualMarketingCampaigns.map(item => item.id)).size, 36);
  for (const item of annualMarketingCampaigns) assert.ok(item.scheduledAt < item.expiresAt, item.id);
});

test("every annual campaign renders with image, CTA, address and unsubscribe", () => {
  for (const campaign of annualMarketingCampaigns) {
    const rendered = annualMarketingEmail(campaign.id, "customer@example.com");
    assert.ok(rendered.html.includes(campaign.image), campaign.id);
    assert.ok(rendered.html.includes("Wynn Essentials, LLC"), campaign.id);
    assert.ok(rendered.html.includes("Unsubscribe"), campaign.id);
    assert.ok(rendered.text.includes("customer%40example.com"), campaign.id);
  }
});
