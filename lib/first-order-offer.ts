// What the welcome offer actually is, and whether it may be advertised at all.
//
// WHY THIS EXISTS
//
// The promotion lives in Stripe. This application does not read it at runtime —
// deliberately: a marketing send must never depend on a Stripe round trip, and
// the secret key has no business in that path. What it knows is a code string,
// a discount label, and whether the promo-code field exists at checkout
// (STRIPE_PROMOTION_CODES_ENABLED → allow_promotion_codes).
//
// Everything a customer is told about the offer therefore comes from
// brandConfig.firstOrder.verifiedTerms, which a human fills in from the live
// Stripe Dashboard and `npm run stripe:check`. There is no code path that can
// print an offer term nobody verified.
//
// THE LINE THIS MODULE DRAWS
//
//   VERIFIABLE HERE   the code, the discount label, and whether a code can be
//                     entered at checkout at all.
//   VERIFIED BY HAND  the scope and offer wording in verifiedTerms.
//   NEVER CLAIMED     first-time-customer eligibility, minimum purchase,
//                     maximum redemptions, customer restrictions, product
//                     restrictions, continued availability. Not asserted to apply, and not asserted to
//                     be absent — the disclaimer covers both.

import { brandConfig } from "../app/data";

// The same environment variable that drives `allow_promotion_codes` at checkout
// (lib/commerce-config.ts). Read on every call rather than captured at module
// load, so the answer always reflects the environment the request is running
// in — a value frozen at import time is the kind of thing that quietly keeps
// advertising a code after the flag has been turned off, or after Stripe has
// deactivated the promotion and an operator has switched the field back off in
// response.
const promoFieldAtCheckout = () => process.env.STRIPE_PROMOTION_CODES_ENABLED === "true";

export type FirstOrderOffer = {
  /** e.g. "WELCOME15". */
  code: string;
  /** e.g. "15% off" — the discount, verified against the live coupon. */
  label: string;
  /** e.g. "ONE ELIGIBLE ORDER" — the scope Stripe's duration licenses. */
  appliesTo: string;
  /**
   * A REAL, verified expiry date ("EXPIRES 31 DECEMBER 2026"), or null to say
   * nothing about expiry at all — which is what production does today.
   *
   * Never an absence claim. "No listed expiration" reads as a promise that the
   * offer will still be there, and nothing verifies that: Stripe can deactivate
   * or change the promotion at any time, and an email is read long after it is
   * sent. Silence is honest; checkout is the source of truth.
   */
  expiration: string | null;
  /** The one-sentence customer-facing offer statement. */
  offerLine: string;
  /** Covers the restrictions that could not be verified. Null to omit. */
  disclaimer: string | null;
};

/**
 * The offer, or null when it must not be advertised.
 *
 * Returns null when the promo-code field is switched off at checkout — the code
 * could not be entered even if she had it, so emailing it would promise
 * something the checkout cannot honour. Also returns null when the code, the
 * label, or the verified offer statement is missing, which is how an operator
 * turns the offer off without a code change: blank out `offerLine` and the
 * sender falls back to a welcome with no offer in it.
 *
 * There is no partial state. Either every verified field is present and the
 * offer is advertised exactly as written, or nothing about it is said at all —
 * so a half-configured entry can never degrade into a vaguer, stronger claim.
 */
export function firstOrderOffer(): FirstOrderOffer | null {
  if (!promoFieldAtCheckout()) return null;

  const { code, discountLabel, verifiedTerms } = brandConfig.firstOrder;
  const trimmed = {
    code: (code ?? "").trim(),
    label: (discountLabel ?? "").trim(),
    appliesTo: (verifiedTerms?.appliesTo ?? "").trim(),
    offerLine: (verifiedTerms?.offerLine ?? "").trim(),
  };
  if (!trimmed.code || !trimmed.label || !trimmed.appliesTo || !trimmed.offerLine) return null;

  return {
    ...trimmed,
    expiration: (verifiedTerms?.expiration ?? "").trim() || null,
    disclaimer: (verifiedTerms?.disclaimer ?? "").trim() || null,
  };
}
