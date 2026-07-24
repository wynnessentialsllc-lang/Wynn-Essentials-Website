# Going live with Stripe

`.env.local` already exists and is gitignored. Never commit keys or paste them into chat.

## 0. Provision the orders database

Orders are stored in a dedicated Neon Postgres database, separate from the Crown
app's Supabase project so customer PII stays isolated.

1. In the Vercel dashboard: **Storage → Create Database → Neon (Postgres)**.
2. Attach it to this project. Vercel injects a `DATABASE_URL`.
3. Copy the **pooled** connection string (the host contains `-pooler`) into
   `ORDERS_DATABASE_URL`, both in `.env.local` and in Vercel's environment
   variables for Production and Preview.
4. Apply the schema:

```bash
npm run db:migrate
```

`ORDERS_DATABASE_URL` is server-only. Never rename it with a `NEXT_PUBLIC_`
prefix — that would inline the credential into the browser bundle.

## 1. Add your test keys

From the Stripe dashboard in **test mode**, copy your keys into `.env.local`:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## 2. Create the products, prices, and shipping rates

```bash
npm run stripe:setup
```

This creates all 9 products and their prices in Stripe, creates standard / expedited /
free shipping rates, then writes the resulting IDs back into `app/data.ts` and
`.env.local`. It is safe to re-run — products are matched on the `wynn_slug`
metadata key, so it reuses whatever already exists instead of creating duplicates.

Shipping amounts are set at the top of `scripts/setup-stripe.mjs`
(standard $5.95, expedited $14.95). Edit them there before the first run if they are wrong.

## 3. Point Stripe at the webhook

```bash
npm run dev
```

In a second terminal:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the listener's `whsec_...` into `STRIPE_WEBHOOK_SECRET` in `.env.local`, then restart the dev server.

## 4. Confirm you are ready

```bash
npm run stripe:check
```

This verifies every displayed price matches the amount Stripe will actually charge,
that all shipping rates exist and are active, and that order storage is wired up.
It exits non-zero while anything is still blocking.

## 5. Test-mode checklist

Card `4242 4242 4242 4242`, any future expiry and CVC.

- Single product, multiple products, quantity changes, item removal.
- Invalid item, variant, and quantity payloads are rejected.
- Subtotal under $50 offers paid standard shipping; $50 and over offers free shipping.
- Cancellation preserves `wynnCart`; only a verified paid success clears it.
- Declined card (`4000 0000 0000 0002`) leaves no order behind.
- `checkout.session.completed` creates exactly one order. Resend the same event with
  `stripe events resend <id>` and confirm no duplicate is written.
- Asynchronous success and failure events, if delayed payment methods are enabled.

## 6. Before switching to live keys

Confirm each of these — the preflight cannot check them for you:

- Return, refund, and shipping policies are published on the site.
- Stripe Tax registration and nexus are correct if `STRIPE_TAX_ENABLED=true`.
- A fulfillment process exists for reading new orders out of the `orders` table.
- `NEXT_PUBLIC_SITE_URL` points at the real domain, not localhost.

Then swap in `sk_live_`/`pk_live_` keys, create a live webhook endpoint in the Stripe
dashboard pointing at `https://<your-domain>/api/stripe/webhook`, copy its signing
secret into the deployed environment, and run:

```bash
npm run stripe:setup -- --live
```

The script refuses to touch a live account without that explicit flag.
