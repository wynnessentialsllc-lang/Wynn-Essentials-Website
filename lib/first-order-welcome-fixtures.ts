// Safe sample offers for previewing and testing the welcome email.
//
// None of these are read at runtime — they exist so the message can be rendered
// and asserted on without touching Stripe, the database, or a real subscriber.
//
// `verified-today` mirrors what was actually confirmed in the live Stripe
// Dashboard on 2026-08-13 and is the shape production sends: no expiry claim at
// all, because "no expiration shown today" is not a promise of continued
// availability. The others exist to prove the renderer handles a genuinely
// verified expiry date, and does not overflow on longer values.

import type { FirstOrderOffer } from "./first-order-offer";

export type FirstOrderFixture = {
  key: string;
  description: string;
  email: string;
  offer: FirstOrderOffer;
};

/** Exactly what production renders today, from brandConfig.firstOrder.verifiedTerms. */
export const VERIFIED_OFFER: FirstOrderOffer = {
  code: "WELCOME15",
  label: "15% off",
  appliesTo: "ONE ELIGIBLE ORDER",
  // Nothing is said about expiry: Stripe shows none today, but that is not a
  // guarantee the offer will still be available when the email is read.
  expiration: null,
  offerLine: "Use code WELCOME15 for 15% off one eligible order. Offer availability is confirmed at checkout.",
  disclaimer: "Eligibility, availability, and product restrictions may apply. Enter WELCOME15 at checkout to confirm your order qualifies.",
};

export const firstOrderFixtures: FirstOrderFixture[] = [
  {
    key: "verified-today",
    description: "What production sends: the terms confirmed in the live Stripe Dashboard on 2026-08-13.",
    email: "preview@example.com",
    offer: VERIFIED_OFFER,
  },
  {
    key: "with-real-expiry",
    description: "What a genuinely verified expiry date would look like. The field is for a real date only — never for an absence claim.",
    email: "preview@example.com",
    offer: {
      ...VERIFIED_OFFER,
      expiration: "EXPIRES 31 DECEMBER 2026",
      offerLine: "Use code WELCOME15 for 15% off one eligible order. Expires 31 December 2026.",
    },
  },
  {
    key: "long-values",
    description: "A longer code and a fixed-amount discount, to check the offer card does not overflow.",
    email: "preview@example.com",
    offer: {
      ...VERIFIED_OFFER,
      code: "WELCOME-ESSENTIALS-2026",
      label: "$15 off",
      appliesTo: "ONE ELIGIBLE ORDER",
      offerLine: "Use code WELCOME-ESSENTIALS-2026 for $15 off one eligible order. Offer availability is confirmed at checkout.",
    },
  },
];

export const firstOrderFixtureByKey = (key: string): FirstOrderFixture | undefined =>
  firstOrderFixtures.find(f => f.key === key);
