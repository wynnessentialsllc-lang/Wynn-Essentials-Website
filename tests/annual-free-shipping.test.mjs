import assert from "node:assert/strict";
import test from "node:test";
import { annualFreeShipping, getFreeShippingCampaign } from "../lib/annual-free-shipping.ts";

test("free-shipping windows never overlap", () => {
  const sorted = [...annualFreeShipping].sort((a, b) => a.startsAt - b.startsAt);
  for (let index = 1; index < sorted.length; index++) assert.ok(sorted[index - 1].endsAt <= sorted[index].startsAt);
});

test("Cyber Monday free shipping begins and ends at midnight PT", () => {
  assert.equal(getFreeShippingCampaign(new Date("2026-11-30T12:00:00Z"))?.id, "cyber-monday-2026");
  assert.equal(getFreeShippingCampaign(new Date("2026-12-01T08:00:00Z")), null);
});
