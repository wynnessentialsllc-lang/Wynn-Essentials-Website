# Wynn Essentials launch configuration

Run `npm run stripe:check` at any time for the current, verified status.

Prices, sizes, directions, and ingredient lists are in place for all nine products. Stripe Product and Price IDs are created by `npm run stripe:setup` — see `STRIPE_TESTING.md`. Checkout remains disabled until every item in a customer's bag is configured.

Commerce setup still required:

- Add Stripe test keys and webhook secret to `.env.local`.
- Run `npm run stripe:setup` to create Products, Prices, and Shipping Rates.
- Confirm the standard ($5.95) and expedited ($14.95) shipping amounts in `scripts/setup-stripe.mjs`.
- Confirm whether the $50 free-shipping statement and threshold are accurate.
- Decide and configure Stripe promotion-code support.
- Confirm Stripe Tax registration, nexus, product tax codes, shipping tax treatment, and collection regions before enabling Stripe Tax.
- Provision Neon Postgres via Vercel and set `ORDERS_DATABASE_URL`, then run `npm run db:migrate`.
- Build a fulfillment workflow for reading new orders out of the `orders` table.
- Confirm return, refund, shipping, and fulfillment policies.

Done: durable order storage on Neon Postgres with unique Stripe event/session constraints, RLS enabled on the order tables, and server-side enforcement of the free-shipping threshold.

Brand setup still required: founder details and portrait, social URLs, review provider, email/SMS provider, final consent language, and assets listed in `ASSET_REQUIREMENTS.md`.
