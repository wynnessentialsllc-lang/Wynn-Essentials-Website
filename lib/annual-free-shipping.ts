export const annualFreeShipping = [
  { id: "labor-day-2026", label: "Labor Day", startsAt: Date.parse("2026-09-04T00:00:00-07:00"), endsAt: Date.parse("2026-09-07T00:00:00-07:00") },
  { id: "national-hair-day-2026", label: "National Hair Day", startsAt: Date.parse("2026-10-01T00:00:00-07:00"), endsAt: Date.parse("2026-10-02T00:00:00-07:00") },
  { id: "cyber-monday-2026", label: "Cyber Monday", startsAt: Date.parse("2026-11-30T00:00:00-08:00"), endsAt: Date.parse("2026-12-01T00:00:00-08:00") },
  { id: "holiday-self-care-2026", label: "Holiday self-care", startsAt: Date.parse("2026-12-19T00:00:00-08:00"), endsAt: Date.parse("2026-12-20T00:00:00-08:00") },
  { id: "valentines-day-2027", label: "Valentine's Day", startsAt: Date.parse("2027-02-14T00:00:00-08:00"), endsAt: Date.parse("2027-02-15T00:00:00-08:00") },
  { id: "mothers-day-2027", label: "Mother's Day", startsAt: Date.parse("2027-05-09T00:00:00-07:00"), endsAt: Date.parse("2027-05-10T00:00:00-07:00") },
  { id: "summer-reset-2027", label: "End-of-summer reset", startsAt: Date.parse("2027-08-29T00:00:00-07:00"), endsAt: Date.parse("2027-08-31T00:00:00-07:00") },
] as const;

export function getFreeShippingCampaign(now: Date | number = Date.now()) {
  const timestamp = typeof now === "number" ? now : now.getTime();
  return annualFreeShipping.find(item => timestamp >= item.startsAt && timestamp < item.endsAt) ?? null;
}
