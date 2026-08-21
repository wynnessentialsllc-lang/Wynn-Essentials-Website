import { products } from "../app/data";

export type AnnualPromotion = {
  id: string;
  code: string;
  name: string;
  percentOff: number;
  startsAt: Date;
  endsAt: Date;
};

// Promotional codes are created only when their window opens. All times are
// stored in UTC; the ISO offsets below preserve the intended Los Angeles time
// across daylight-saving changes.
export const annualPromotions: AnnualPromotion[] = [
  { id: "labor-day-2026", code: "LABORDAY20", name: "Labor Day 2026", percentOff: 20, startsAt: new Date("2026-09-07T00:00:00-07:00"), endsAt: new Date("2026-09-08T00:00:00-07:00") },
  { id: "black-friday-2026", code: "BLACKFRIDAY25", name: "Black Friday 2026", percentOff: 25, startsAt: new Date("2026-11-26T18:00:00-08:00"), endsAt: new Date("2026-11-28T08:00:00-08:00") },
  { id: "cyber-monday-2026", code: "CYBER20", name: "Cyber Monday 2026", percentOff: 20, startsAt: new Date("2026-11-30T00:00:00-08:00"), endsAt: new Date("2026-12-01T00:00:00-08:00") },
  { id: "holiday-gifting-2026", code: "GIFT15", name: "Holiday Gifting 2026", percentOff: 15, startsAt: new Date("2026-12-10T00:00:00-08:00"), endsAt: new Date("2026-12-14T00:00:00-08:00") },
  { id: "holiday-reset-2026", code: "RESET20", name: "Post-Holiday Reset 2026", percentOff: 20, startsAt: new Date("2026-12-26T00:00:00-08:00"), endsAt: new Date("2026-12-28T00:00:00-08:00") },
  { id: "winter-reset-2027", code: "WINTER15", name: "Winter Reset 2027", percentOff: 15, startsAt: new Date("2027-01-08T00:00:00-08:00"), endsAt: new Date("2027-01-11T00:00:00-08:00") },
  { id: "love-your-hair-2027", code: "LOVE20", name: "Love Your Hair 2027", percentOff: 20, startsAt: new Date("2027-02-07T00:00:00-08:00"), endsAt: new Date("2027-02-15T00:00:00-08:00") },
  { id: "spring-reset-2027", code: "SPRING20", name: "Spring Reset 2027", percentOff: 20, startsAt: new Date("2027-03-20T00:00:00-07:00"), endsAt: new Date("2027-03-22T00:00:00-07:00") },
  { id: "spring-gifting-2027", code: "SPRINGGIFT15", name: "Spring Gifting 2027", percentOff: 15, startsAt: new Date("2027-03-28T00:00:00-07:00"), endsAt: new Date("2027-03-30T00:00:00-07:00") },
  { id: "graduation-2027", code: "NEXTCHAPTER15", name: "Graduation 2027", percentOff: 15, startsAt: new Date("2027-05-23T00:00:00-07:00"), endsAt: new Date("2027-05-25T00:00:00-07:00") },
  { id: "memorial-day-2027", code: "SUMMER20", name: "Memorial Day 2027", percentOff: 20, startsAt: new Date("2027-05-31T00:00:00-07:00"), endsAt: new Date("2027-06-02T00:00:00-07:00") },
  { id: "fathers-day-2027", code: "FORHIM15", name: "Father's Day 2027", percentOff: 15, startsAt: new Date("2027-06-20T00:00:00-07:00"), endsAt: new Date("2027-06-21T00:00:00-07:00") },
  { id: "independence-day-2027", code: "FREEDOM15", name: "Independence Day 2027", percentOff: 15, startsAt: new Date("2027-07-04T00:00:00-07:00"), endsAt: new Date("2027-07-05T00:00:00-07:00") },
  { id: "back-to-school-2027", code: "SCHOOL15", name: "Back to School 2027", percentOff: 15, startsAt: new Date("2027-08-08T00:00:00-07:00"), endsAt: new Date("2027-08-10T00:00:00-07:00") },
];

// Stripe's coupon scope is the enforcement boundary: Boho Hair is omitted, so
// even a copied code cannot discount a preorder. Gift cards are not in this
// catalog; products without a verified Stripe id are also omitted.
export const annualPromotionProductIds = Array.from(new Set(
  products
    .filter(product => product.kind !== "hair" && product.stripeProductId)
    .map(product => product.stripeProductId as string),
));

export function promotionsToActivate(now = new Date()) {
  return annualPromotions.filter(promotion => now >= promotion.startsAt && now < promotion.endsAt);
}
