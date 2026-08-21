export const laborDay2026 = {
  freeShippingStartsAt: Date.parse("2026-09-04T07:00:00.000Z"), // Sep 4, 12:00 AM PT
  freeShippingEndsAt: Date.parse("2026-09-07T07:00:00.000Z"),   // Sep 7, 12:00 AM PT
  discountStartsAt: Date.parse("2026-09-07T07:00:00.000Z"),
  discountEndsAt: Date.parse("2026-09-08T07:00:00.000Z"),       // Sep 8, 12:00 AM PT
  promotionCode: "LABORDAY20",
  couponId: "wynn_labor_day_2026_20",
} as const;

export type LaborDayOffer = "free-shipping" | "twenty-percent" | null;

export function getLaborDayOffer(now: Date | number = Date.now()): LaborDayOffer {
  const timestamp = typeof now === "number" ? now : now.getTime();
  if (timestamp >= laborDay2026.freeShippingStartsAt && timestamp < laborDay2026.freeShippingEndsAt) return "free-shipping";
  if (timestamp >= laborDay2026.discountStartsAt && timestamp < laborDay2026.discountEndsAt) return "twenty-percent";
  return null;
}

