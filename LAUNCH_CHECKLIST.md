# Wynn Essentials — Launch & Configuration Checklist

Everything the code needs from you to be fully live. Code is done; these are the
config, database, Stripe, and asset steps only the owner can complete.

## 1. Vercel environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (Production).

| Variable | Purpose | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL | Exactly `https://wynnessentialsllc.us` (no www, no trailing slash) |
| `STRIPE_SECRET_KEY` | Stripe server key | Use `sk_live_…` for real orders |
| `STRIPE_PUBLISHABLE_KEY` | Stripe server-side publishable | `pk_live_…` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | "Pay in 4" messaging on product pages | Same `pk_live_…` value; browser-safe |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhooks | From the live webhook endpoint |
| `STRIPE_STANDARD_SHIPPING_RATE_ID` / `STRIPE_EXPEDITED_SHIPPING_RATE_ID` / `STRIPE_FREE_SHIPPING_RATE_ID` | Shipping rates | Created by `npm run stripe:setup` |
| `STRIPE_PROMOTION_CODES_ENABLED` | Shows promo-code box at checkout | `true` (needed for `WELCOME15`) |
| `STRIPE_TAX_ENABLED` | Stripe Tax | `true` only after tax registration is confirmed |
| `ORDERS_DATABASE_POSTGRES_URL` / `..._NON_POOLING` | Neon Postgres | From the Vercel–Neon integration |
| `ADMIN_ORDERS_TOKEN` | Admin login (orders, reviews, inventory, blog) | 16+ random chars |
| `RESEND_API_KEY` (or `wynnessentials_site`) | Email sending | `re_…` from Resend |
| `NOTIFY_TO` | Owner alert inbox | `wynnessentialsllc@gmail.com` |
| `NOTIFY_FROM` | From address for all emails | `Wynn Essentials <notifications@wynnessentialsllc.us>` (verified domain) |
| `CRON_SECRET` | Authorizes the abandoned-cart cron | 16+ random chars |

## 2. Database migrations (Neon)

Run `npm run db:migrate` (after `npx vercel env pull .env.local`), **or** paste each
`drizzle/*.sql` into the Neon SQL editor. Recent additions:

- `0008_order_tracking.sql` — shipping/tracking columns (shipping emails)
- `0009_abandoned_carts.sql` — abandoned-cart recovery
- `0010_blog_posts.sql` + `0011_seed_blog_drafts.sql` — Insights blog + starter drafts

## 3. Stripe dashboard

- Add live keys + create the live **webhook endpoint** (`/api/stripe/webhook`) and copy its signing secret.
- Run `npm run stripe:setup` to create Products, Prices, and Shipping Rates.
- Create a coupon (15% off) with a customer-facing promotion code **`WELCOME15`** (first-time customers only recommended; no total-redemption cap).
- Enable Buy-Now-Pay-Later (Klarna/Afterpay/Affirm) + wallets — **done**.
- Decide on **Stripe Tax** (registration, nexus, product tax codes) before setting `STRIPE_TAX_ENABLED=true`.
- Optional: turn off Stripe's own receipt email if you prefer only the branded confirmation.

## 4. Email (Resend)

- API key set in Vercel — **done**.
- Sending domain `wynnessentialsllc.us` verified — **done**.
- Test: place a test order + submit a test review; confirm owner + customer emails arrive.

## 5. Google Search Console

- Domain verified + `sitemap.xml` submitted — **done**.
- After deploys, use **URL Inspection → Request Indexing** on key product pages.

## 6. Content

- Publish the 3 starter **Insights** drafts (`/admin/blog`) after reviewing/editing.
- Seed real customer **reviews** (`app/reviews.ts`) and moderate incoming ones (`/admin/reviews`).
- Add braiding-hair **lengths/colors** as variants (each needs its own Stripe price) when offered.

## 7. Brand assets (see `ASSET_REQUIREMENTS.md`)

- Replace placeholder images (hero, founder portrait, any remaining pack shots).
- Confirm founder details and social URLs.
- Provide descriptive alt text + usage rights for all final images.
