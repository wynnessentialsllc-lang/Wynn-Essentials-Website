# Wynn Essentials launch configuration

Run `npm run stripe:check` at any time for the current, verified status.

## Two domains, deliberately

- `wynnessentialsllc.us` — this site, on Vercel. Used for `metadataBase`, the
  sitemap, `robots.txt`, and the schema.org organization URL.
- `wynnessentialsllc.us` — the Wynn Essentials storefront. The remaining
  `wynnessentialsllc.us/products/...` links in `app/WynnShop.tsx` (Boho Hair and
  the Essential Oils Care video shortcuts) point there on purpose. Do not rewrite
  them to the Vercel domain.

The Soft Life Bonnet, Heritage Hold Satin Scrunchie Set, and Hair Wellness
Bundle are now first-class catalog products in `app/data.ts` and sell through
Stripe checkout like the hair products. The bonnet offers a color choice; all
colors ship at one price, so a single Stripe price covers them and the selected
color rides on the checkout line item via `price_data`.

The canonical host is the apex, `wynnessentialsllc.us`. Vercel 307-redirects
`www` to it, so customers browse the apex.

`NEXT_PUBLIC_SITE_URL` must therefore be exactly `https://wynnessentialsllc.us`
with no `www` and no trailing slash. Checkout compares the browser origin
against it and returns 403 on a mismatch, which does not look like a domain
problem when debugging.

Prices and sizes are in place for all twelve catalog items (nine hair products plus the bonnet, scrunchie set, and bundle); directions and ingredient lists are in place for the nine hair products. Stripe Product and Price IDs are created by `npm run stripe:setup` — see `STRIPE_TESTING.md`. Checkout remains disabled until every item in a customer's bag is configured.

Commerce setup still required:

- Add Stripe test keys and webhook secret to `.env.local`.
- Set `ADMIN_ORDERS_TOKEN` (16+ random characters) in `.env.local` and in Vercel.
- Run `npm run stripe:setup` to create Products, Prices, and Shipping Rates.
- Run `npx vercel env pull .env.local`, then `npm run db:migrate` to create the order, subscriber, support, and product-review tables. The `product_reviews` table (migration `0007`) backs the storefront "Write a Review" form; submissions are held for moderation in `/admin/reviews` and only approved reviews appear on the storefront.
- Attach the production domain and set `NEXT_PUBLIC_SITE_URL`. Stripe builds its
  success and cancel URLs from it, so checkout redirects to localhost until this is done.
- Decide and configure Stripe promotion-code support.
- Confirm Stripe Tax registration, nexus, product tax codes, shipping tax treatment, and collection regions before enabling Stripe Tax.
- Confirm return, refund, and fulfillment policies.

Shipping, confirmed 2026-07-24 — do not change without re-running `stripe:setup`,
since a Stripe price cannot be edited after it is created:

- Standard $5.95 (3–7 business days), expedited $14.95 (1–3 business days).
- Free U.S. shipping once the cart subtotal reaches $50. A subtotal of exactly
  $50.00 qualifies, matching what the cart tells the customer.

Done: durable order storage on Neon Postgres with unique Stripe event/session constraints, RLS enabled on the order tables, server-side enforcement of the free-shipping threshold, and a token-gated fulfillment view at `/admin/orders`.

Brand setup still required: founder details and portrait, social URLs, email/SMS provider, final consent language, and assets listed in `ASSET_REQUIREMENTS.md`. Customer reviews are first-party: historical reviews are seeded in `app/reviews.ts`, and new ones are collected through the on-site "Write a Review" form, stored in `product_reviews`, and published after approval in `/admin/reviews` — no third-party review provider is required.

"The Wynn Edit" newsletter signups persist to the `subscribers` table
(email, phone, marketing consent, the exact consent text shown, and source),
locked to server-side access with the same RLS posture as the order tables.
Run `npm run db:migrate` to create it. Storing a signup does not send anything:
connecting the email/SMS provider above is what turns these rows into welcome
and marketing messages.
