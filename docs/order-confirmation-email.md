# Order confirmation email

The receipt a customer receives the moment Stripe reports a paid checkout.

## Where it lives

| Piece | File |
| --- | --- |
| Template (subject, HTML, plain text) | `lib/order-confirmation-email.ts` |
| Sending (Resend) | `lib/notify.ts` → `notifyCustomerOrderConfirmation()` |
| Order data | `lib/record-order.ts` → `orderRowFromSession()` |
| Live trigger | `app/api/stripe/webhook/route.ts` (paid checkout) |
| Backfill trigger | `app/api/cron/reconcile-orders/route.ts` (a missed webhook) |
| Sample orders | `lib/order-confirmation-fixtures.ts` |
| Preview / test send | `scripts/preview-order-confirmation.mjs` |
| Tests | `tests/order-confirmation-email.test.mjs` |
| Email imagery | `public/email/` |

Nothing about how or when the email is sent changed with the redesign. The
webhook still emails only after claiming the Stripe event id, and the reconcile
cron only after a fresh insert, so a redelivered event never produces a second
receipt.

## Dynamic fields

Everything comes from the recorded order row — no order detail is baked into an
image, and every value is HTML-escaped before it reaches the markup.

| Shown in the email | Source |
| --- | --- |
| Customer first name | `customerName`, first word (copy drops the name when absent) |
| Order number | `orderReference` |
| Product name, size | catalog match on `items[].productId`, else the line description |
| Product photo | catalog gallery, first JPEG/PNG (see "Images" below) |
| Selected variant / colour | the ` · `-separated suffix on the line description |
| Quantity, unit price, line total | `items[].quantity` / `unitAmount` / `totalAmount` |
| Subtotal, discount, shipping, tax, total | `subtotalAmount`, `discountAmount`, `shippingAmount`, `taxAmount`, `totalAmount` |
| "FREE" shipping | `shippingAmount === 0` |
| Shipping name and address | `shippingAddress` (Stripe `collected_information.shipping_details`) |
| VIEW MY ORDER | `/order/success?session_id=<sessionId>` — the same page Stripe redirects to, which re-verifies the session before showing anything |
| Tracking | `carrier` + `trackingNumber` when set; the block is omitted at confirmation time, when they normally are not |

Billing address is deliberately not shown: the order row does not store one, and
the previous email did not include it either. Adding it would mean changing what
the webhook records.

## Preview

```bash
npm run email:preview
open outputs/email-preview/index.html
```

Renders all seven sample orders to `outputs/email-preview/` (git-ignored):
one product, several products, quantity > 1, variants and colours, a discount,
free and paid shipping, tax, a long product name, a long customer name, a
multiline address, a product with no usable photo, a missing first name, and
tracking both absent and present.

Images in the preview load from the production site, so the photography only
appears once `public/email/` has been deployed. Copy and order data render
offline.

## Safe test send

```bash
RESEND_API_KEY=re_… npm run email:preview -- --send you@example.com
RESEND_API_KEY=re_… npm run email:preview -- --send you@example.com --fixture long-values
```

Sends one sample order, subject-prefixed `[TEST]`, to an address you name. It
uses fixture data only and never touches the orders table, Stripe, or a
customer's address. While `NOTIFY_FROM` is unset the From address is
`onboarding@resend.dev`, which Resend will only deliver to the address that owns
the API key.

To exercise the real path end to end instead, place a Stripe test-mode order
(see `STRIPE_TESTING.md`); the webhook then sends the same template to the email
entered at checkout.

## Configuration

No new environment variables. The email reads what already exists:

| Variable | Effect |
| --- | --- |
| `RESEND_API_KEY` (or `wynnessentials_site`) | Required to send at all; without it sends are skipped and logged. |
| `NOTIFY_FROM` | The From address. Set it to `Wynn Essentials <orders@wynnessentialsllc.us>` once the domain is verified in Resend, otherwise customer receipts cannot be delivered. |
| `NEXT_PUBLIC_SITE_URL` | Only used when it is an https, non-localhost origin; otherwise images and links resolve against `https://wynnessentialsllc.us`. |

Resend dashboard: verify the sending domain (SPF/DKIM) before switching
`NOTIFY_FROM`, or receipts will be limited to the account owner's inbox.

## Images

Transactional images must load in every client, so:

* only JPEG/PNG (WebP and AVIF do not render in Outlook for Windows);
* absolute `https://wynnessentialsllc.us/…` URLs — never a preview, blob or
  data URL;
* descriptive `alt` on every image;
* no order information inside an image, and no background-image layout.

`public/email/` holds the three editorial assets, exported from the site's own
photography (`hero-nourish-sky-full.webp`, `wynn-essentials-spa-shelf.webp`,
`wynn-essentials-logo-envelope.png`). Product thumbnails come from the catalog
in `app/data.ts`; when a product's gallery is WebP/AVIF only, an
`EMAIL_IMAGE_OVERRIDES` entry points at the existing JPEG of the same product.
A test fails if any catalog product has no email-safe photo on disk, so adding a
WebP-only product surfaces immediately.

## Client notes

* **Outlook 2016–2021 / Windows (Word engine)** — ignores media queries, which
  is correct there: it renders the 600px desktop layout. Rounded corners on the
  step numbers fall back to squares. It renders no WebP/AVIF, which is why the
  images are JPEG/PNG.
* **Gmail (web, iOS, Android)** — supports the embedded style block and the
  media query. Clipping starts around 102 KB of HTML; the largest scenario is
  ~23 KB, so no "[Message clipped]".
* **Apple Mail / iOS Mail** — full support. `x-apple-disable-message-reformatting`
  keeps it from re-flowing the 600px layout.
* **Dark mode** — the email declares `light only` and paints every background
  explicitly, so clients that force-invert (mainly Outlook.com) shift the neutrals
  but keep text legible on its own background.
* **Images off** — every price, product, address and link is live text; the
  layout has no image-only region.
