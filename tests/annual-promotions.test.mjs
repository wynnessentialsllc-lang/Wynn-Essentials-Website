import assert from "node:assert/strict";
import test from "node:test";
import { annualPromotionProductIds, annualPromotions, promotionsToActivate } from "../lib/annual-promotions.ts";
import { products } from "../app/data.ts";

test("annual percentage promotions use unique codes and valid windows", () => {
  assert.equal(new Set(annualPromotions.map(item => item.code)).size, annualPromotions.length);
  for (const promotion of annualPromotions) {
    assert.ok(promotion.startsAt < promotion.endsAt, promotion.id);
    assert.ok(promotion.percentOff > 0 && promotion.percentOff <= 25, promotion.id);
  }
});

test("promotion activation is bounded by the exact window", () => {
  assert.deepEqual(promotionsToActivate(new Date("2027-02-10T12:00:00Z")).map(item => item.code), ["LOVE20"]);
  assert.deepEqual(promotionsToActivate(new Date("2027-02-15T08:00:00Z")), []);
});

test("eligible Stripe products exclude all Boho Hair", () => {
  const hairIds = products.filter(product => product.kind === "hair").map(product => product.stripeProductId);
  assert.ok(annualPromotionProductIds.length > 0);
  for (const id of hairIds) assert.ok(!annualPromotionProductIds.includes(id), id);
});
