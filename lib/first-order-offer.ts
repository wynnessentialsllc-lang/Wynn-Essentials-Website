// What the first-order welcome offer actually is, and whether it may be
// advertised at all.
//
// WHY THIS EXISTS
//
// The promotion itself lives in Stripe. This application has never held its
// rules: it knows a code string and a percentage label (app/data.ts), and it
// knows whether the promo-code field is switched on at checkout
// (STRIPE_PROMOTION_CODES_ENABLED → allow_promotion_codes). Eligibility,
// exclusions, minimum purchase, expiry and redemption limits are configured in
// the Stripe dashboard and are NOT readable from here.
//
// So this module draws a hard line between two kinds of statement:
//
//   VERIFIABLE   the code string, the discount label, and whether a customer
//                can enter a code at checkout at all. All three come from the
//                application's own configuration.
//   NOT VERIFIABLE  every other term. Nothing here invents one, and the email
//                renderer has no way to print one that was not configured
//                below by a human who checked Stripe.
//
// `npm run stripe:check` reads the live promotion and prints its real terms, so
// the values in `verifiedTerms` can be filled in from something authoritative
// rather than from memory.

import { brandConfig } from "../app/data";

// The same environment variable that drives `allow_promotion_codes` at checkout
// (lib/commerce-config.ts). Read on every call rather than captured at module
// load, so the answer always reflects the environment the request is running
// in — a value frozen at import time is the kind of thing that quietly keeps
// advertising a code after the flag has been turned off.
const promoFieldAtCheckout = () => process.env.STRIPE_PROMOTION_CODES_ENABLED === "true";

export type FirstOrderOffer = {
  code: string;
  /** e.g. "15% off" — the label the storefront already shows. */
  label: string;
  /**
   * Terms confirmed against the live Stripe promotion by a human and recorded
   * in app/data.ts. Rendered verbatim when present. Empty by default: an
   * unconfirmed term is simply not shown, never guessed.
   */
  verifiedTerms: readonly string[];
};

/**
 * The offer, or null when it must not be advertised.
 *
 * Returns null when the promo-code field is switched off at checkout: the code
 * could not be entered even if she had it, so emailing it would be promising
 * something the checkout cannot honour. Also returns null if the code or label
 * is blank, which is how an operator turns the offer off without a code change.
 */
export function firstOrderOffer(): FirstOrderOffer | null {
  if (!promoFieldAtCheckout()) return null;
  const code = (brandConfig.firstOrder.code ?? "").trim();
  const label = (brandConfig.firstOrder.discountLabel ?? "").trim();
  if (!code || !label) return null;
  return {
    code,
    label,
    verifiedTerms: brandConfig.firstOrder.verifiedTerms ?? [],
  };
}
