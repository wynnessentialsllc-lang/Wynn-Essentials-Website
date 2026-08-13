// Safe sample offers for previewing and testing the first-order welcome email.
//
// None of these are read at runtime — they exist so the message can be rendered
// and asserted on without touching Stripe, the database, or a real subscriber.
//
// The terms in `withVerifiedTerms` are ILLUSTRATIVE ONLY. They are here to prove
// the renderer prints configured terms verbatim; they are not claims about the
// live WELCOME15 promotion and must never be copied into
// brandConfig.firstOrder.verifiedTerms without checking Stripe first
// (`npm run stripe:check` prints the real ones).

import type { FirstOrderOffer } from "./first-order-offer";

export type FirstOrderFixture = {
  key: string;
  description: string;
  email: string;
  offer: FirstOrderOffer;
};

export const firstOrderFixtures: FirstOrderFixture[] = [
  {
    key: "default",
    description: "The live shape today: a code and a discount label, with no terms confirmed against Stripe yet.",
    email: "preview@example.com",
    offer: { code: "WELCOME15", label: "15% off", verifiedTerms: [] },
  },
  {
    key: "with-verified-terms",
    description: "What the card looks like once real Stripe terms have been confirmed and recorded. Sample wording — not the live terms.",
    email: "preview@example.com",
    offer: {
      code: "WELCOME15",
      label: "15% off",
      verifiedTerms: [
        "SAMPLE TERM — first-time customers only.",
        "SAMPLE TERM — expires 31 December 2026.",
      ],
    },
  },
  {
    key: "long-code",
    description: "A longer code and a fixed-amount label, to check the offer card does not overflow.",
    email: "preview@example.com",
    offer: { code: "WELCOME-FIRST-ORDER-2026", label: "$15 off", verifiedTerms: [] },
  },
];

export const firstOrderFixtureByKey = (key: string): FirstOrderFixture | undefined =>
  firstOrderFixtures.find(f => f.key === key);
