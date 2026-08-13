// Safe sample offers for previewing and testing the welcome email.
//
// None of these are read at runtime — they exist so the message can be rendered
// and asserted on without touching Stripe, the database, or a real subscriber.
//
// `verified-today` mirrors what was actually confirmed in the live Stripe
// Dashboard on 2026-08-13 and is the shape production sends. The others exist
// to prove the renderer degrades honestly: no expiry line when none is known,
// and no stronger claim when a field is missing.

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
  expiration: "NO LISTED EXPIRATION",
  offerLine: "Use code WELCOME15 for 15% off one eligible order. No listed expiration.",
  disclaimer: "Eligibility and product restrictions may apply. Enter WELCOME15 at checkout to confirm your order qualifies.",
};

export const firstOrderFixtures: FirstOrderFixture[] = [
  {
    key: "verified-today",
    description: "What production sends: the terms confirmed in the live Stripe Dashboard on 2026-08-13.",
    email: "preview@example.com",
    offer: VERIFIED_OFFER,
  },
  {
    key: "no-expiration-known",
    description: "Expiry unknown rather than absent. The card simply omits the line — it never upgrades silence into 'never expires'.",
    email: "preview@example.com",
    offer: { ...VERIFIED_OFFER, expiration: null, offerLine: "Use code WELCOME15 for 15% off one eligible order." },
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
      offerLine: "Use code WELCOME-ESSENTIALS-2026 for $15 off one eligible order. No listed expiration.",
    },
  },
];

export const firstOrderFixtureByKey = (key: string): FirstOrderFixture | undefined =>
  firstOrderFixtures.find(f => f.key === key);
