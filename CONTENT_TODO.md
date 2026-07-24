# Wynn Essentials launch configuration

Every active product in `app/data.ts` still needs a verified price, size, Stripe Product ID, Stripe Price ID, directions, full ingredient list, product claims, and final product photography: Hydrate, ThairaP, Lathyr, Uplyft, Revaivl, Nourish, Grow, Relief, and Edge Control. Checkout remains disabled until every item in a customer’s bag is configured.

Commerce setup still required:

- Add Stripe test keys and webhook secret.
- Create persistent Stripe Products and one-time Prices.
- Create and add verified standard/expedited Shipping Rate IDs.
- Confirm whether the $50 free-shipping statement and threshold are accurate.
- Decide and configure Stripe promotion-code support.
- Confirm Stripe Tax registration, nexus, product tax codes, shipping tax treatment, and collection regions before enabling Stripe Tax.
- Connect a durable order repository with unique Stripe event/session constraints before live checkout.
- Confirm return, refund, shipping, and fulfillment policies.

Brand setup still required: founder details and portrait, social URLs, review provider, email/SMS provider, final consent language, and assets listed in `ASSET_REQUIREMENTS.md`.
