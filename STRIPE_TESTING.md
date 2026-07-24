# Stripe test-mode checklist

1. Copy `.env.example` to `.env.local` and add test-mode keys only.
2. Add verified test Product/Price IDs to `app/data.ts` and Shipping Rate IDs to `.env.local`.
3. Run `npm run dev`.
4. Run `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
5. Copy the listener’s `whsec_...` value to `STRIPE_WEBHOOK_SECRET`, then restart the app.
6. Complete single-product, multiple-product, quantity, removal, invalid item/variant/quantity, cancellation, declined payment, promotion, shipping, tax, mobile handoff, and return-page tests.
7. Confirm `checkout.session.completed` creates exactly one durable order; resend the event and verify unique event/session constraints prevent duplication.
8. Test asynchronous success and failure events if delayed methods are enabled.
9. Confirm cancellation preserves `wynnCart`; confirm only a verified paid success clears it.

Do not use live keys until the durable order repository, fulfillment workflow, policies, tax settings, webhook endpoint, and catalog validation all pass test mode.
