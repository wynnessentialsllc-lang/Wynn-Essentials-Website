# The first-order welcome (WELCOME15 popup)

What the popup captures, what the email may say about the offer, and why there
is never more than one welcome per subscriber.

## The offer — verified 2026-08-13

Confirmed in the **live Stripe Dashboard**:

| | |
|---|---|
| Promotion code | `WELCOME15` — exists |
| Coupon status | Valid |
| Discount | 15% off |
| Duration | `once` |
| Expiration | None shown *(a fact about the Dashboard that day, not a guarantee of continued availability)* |
| Historical redemptions | 1 — **internal only, never shown to a customer** |

**Not verified, and therefore never claimed in either direction** — we say neither
that these apply nor that they don't:

- first-time-customer restriction
- minimum order amount
- maximum total redemptions
- customer restriction
- product restrictions
- **continued availability** — Stripe can deactivate or change the promotion at
  any time, and an email is read long after it is sent

Two readings that would be wrong, recorded so they are not made again:

- **`duration: once`** means the discount applies once *when redeemed*. It is
  **not** a cap of one redemption across all customers.
- **"1 redemption"** is historical usage. It is **not** a maximum.
- **No expiration shown** is not "never expires". Saying "no listed expiration"
  reads as a promise the offer will still be there, so nothing is said about
  expiry at all. Checkout is the source of truth.

And the coupon is *named* "First order 15% off" in Stripe. **A name is not a
rule.** No first-time-transaction restriction has been verified, so nothing
customer-facing says "your first order", "first-time customers", or
"15% off your first eligible order".

### Exact customer-facing terms

Offer line, in the hero and the plain-text body:

> Use code WELCOME15 for 15% off one eligible order. Offer availability is
> confirmed at checkout.

Offer card — three lines, no expiry claim:

> **15% OFF** · ONE ELIGIBLE ORDER · **CODE: WELCOME15**

Disclaimer, covering exactly the restrictions that could not be verified,
availability among them:

> Eligibility, availability, and product restrictions may apply. Enter WELCOME15
> at checkout to confirm your order qualifies.

The `expiration` field still exists in the offer config, but only for a **real,
verified date** ("EXPIRES 31 DECEMBER 2026") — never for an absence claim.
`stripe:check` blocks if it is used either to claim no expiry or to state a date
Stripe does not have.

Subject: *A little something from Wynn Essentials* · Preview: *Your WELCOME15
offer is inside.* Neither implies first-order eligibility.

### Re-verifying

```bash
npm run stripe:check
```

An **administrative launch/deploy check only** — nothing at website runtime calls
Stripe to resolve the offer, and the secret key never enters the request path.
It confirms the code exists in live mode, the promotion is active, the coupon is
valid, the discount is exactly 15%, and the duration is `once`; **blocks** if any
of those fail or if the promotion cannot be reached; and reports the first-time
restriction, minimum purchase, expiration, maximum redemptions, customer
restriction and product scope **without guessing**, keeping historical
`times_redeemed` clearly apart from `max_redemptions`. It also blocks if
`verifiedTerms` starts claiming first-order eligibility, an absence of
restrictions, or "no listed expiration" after Stripe has set one.

## When the offer is not advertised

`firstOrderOffer()` (`lib/first-order-offer.ts`) returns null when the
promo-code field is switched off at checkout, or when any verified field — code,
label, scope, or offer line — is missing. There is no partial state: either
every verified field is present and the offer renders exactly as written, or
nothing about it is said at all, so a half-configured entry can never degrade
into a vaguer but stronger claim. In that case the popup signup still records consent in full and still
sends a welcome — the plain Wynn Edit welcome, with no code in it. Emailing a
code the checkout would refuse is worse than sending no offer.

The popup's own on-screen success state is unchanged and still shows the code,
so checkout behaviour and the shopper's path to the discount are exactly as
before.

## One welcome per subscriber, across both doors

The send-once claim (`subscribers.welcome_sent_at`) is **per subscriber, not per
form**. The newsletter section and the popup both go through
`/api/subscribe`, and whichever one wins the claim owns the single welcome:

| She does this | She receives |
|---|---|
| Popup only | The first-order welcome, with the offer |
| Newsletter only | The Wynn Edit welcome |
| Newsletter, then popup | The Wynn Edit welcome. The popup shows her the code on screen; no second email |
| Popup, then newsletter | The first-order welcome. No second email |

That is the answer to "would submitting both send two welcomes?" — it cannot,
because there is one claim. A subscriber who already has a welcome still gets
the offer through the popup's existing success state, which is the appropriate
existing flow rather than a duplicate marketing message.

A genuine re-subscription after an unsubscribe re-claims the welcome, so a
returning subscriber is welcomed back exactly once — and only ever on fresh
affirmative consent.

## Consent and suppression

Identical to The Wynn Edit model (see `docs/wynn-edit-welcome.md`): the exact
disclosure text, a consent version, a consent timestamp, the source, and the
placement — recorded as `first-order-welcome-popup` so the two entry points stay
distinguishable in the data. The checkbox is unchecked by default and the signup
is refused without it. A suppressed address is only ever revived by fresh
affirmative consent. No IP is stored.

## The public response reveals nothing

Every successful submission answers `200 {"ok":true,"status":"received"}`,
byte-identical, whether the address is new, already active, suppressed, or
already welcomed through the other form. Whether the offer was previously
redeemed is a Stripe fact the application never reads and therefore cannot leak.

## The email

`lib/first-order-welcome-email.ts`, sent by `notifyFirstOrderWelcome()`.
Built on `lib/email-brand.ts`, so it shares the order confirmation's shell
exactly — cream page, white 600px body, logo band, sky-blue opening cut by the
pink rule, editorial section, black brand footer — plus the marketing footer the
order confirmation does not need.

- Live text for the discount, the code, the CTA labels, the address and the
  unsubscribe link, so a blocked-image inbox loses nothing that matters.
- JPEG/PNG only, absolute production URLs, descriptive alt text.
- Plain-text alternative with the same copy and links.
- `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  (RFC 8058), honoured by `/api/unsubscribe` with a plain 200.
- Reply-To reaches a person; never a no-reply address.
- Refuses to send at all when no unsubscribe signing secret is configured.

## Previews

```bash
npm run email:preview:first-order   # this email only
npm run email:preview               # all three customer emails
```

Writes `build/email-previews/first-order/` (gitignored): HTML and text per
fixture, plus desktop (640px), mobile (390px) and images-blocked renders. Sends
nothing, signs with a throwaway secret, never uses a developer's
`NEXT_PUBLIC_SITE_URL`.

Fixtures live in `lib/first-order-welcome-fixtures.ts`. `verified-today` is
exactly what production sends, with no expiry claim; `with-real-expiry` shows
how a genuinely verified date would render; `long-values` checks the card does
not overflow with a longer code.

## Why `app/api/cron/abandoned-carts/route.ts` changed

The abandoned-cart reminder advertises the same promotion, so it had the same two
problems: it mentioned the code unconditionally, and it said "on your first
order". It now resolves the offer through `firstOrderOffer()` — so it stays
silent about the code when there is no live offer — and says "on one eligible
order. Offer availability is confirmed at checkout."

Nothing else about that job moved. Content, eligibility (pending carts inside the
window, skipping anyone who has since paid), timing (`ABANDON_AFTER_MS` 1h,
`MAX_WINDOW_MS` 30d), one-reminder-per-cart behaviour, the mark-emailed-regardless
rule, and the `CRON_SECRET` authorization are all unchanged, and a test pins each
of them.
