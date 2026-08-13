# The first-order welcome (WELCOME15 popup)

What the popup captures, what the email may say about the offer, and why there
is never more than one welcome per subscriber.

## The offer — what is verified and what is not

The promotion lives in **Stripe**. This application has never held its rules.
What it actually knows:

| Fact | Source | Verified here? |
|---|---|---|
| Code string `WELCOME15` | `brandConfig.firstOrder.code` | Yes — it is what we display |
| Discount label `15% off` | `brandConfig.firstOrder.discountLabel` | Yes — same |
| Whether a code can be entered at checkout | `STRIPE_PROMOTION_CODES_ENABLED` → `allow_promotion_codes` | Yes |
| Eligibility, exclusions, minimum purchase, expiry, redemption limit | Stripe dashboard | **No — not readable from the application** |

`LAUNCH_CHECKLIST.md` *recommends* "first-time customers only, no
total-redemption cap", but that is an instruction to whoever created the coupon,
not a record of what exists. It is not treated as fact anywhere.

So the email states **only** the code, the discount label, and any terms a human
has confirmed and recorded in `brandConfig.firstOrder.verifiedTerms` — empty by
default. With none configured it prints one neutral line that is true of the
checkout rather than of the offer:

> Enter the code at checkout. Your order summary confirms the discount before you pay.

### Confirming the real terms

```bash
npm run stripe:check
```

Now reads the live promotion and prints its actual discount, duration,
first-time-only restriction, minimum purchase, expiry, redemption limit and
product scope. It **blocks** if the code is missing or inactive in Stripe, or if
the site's advertised percentage disagrees with the coupon. Paste the terms
worth telling a customer about into `verifiedTerms`; the email renders each on
its own line and invents nothing.

## When the offer is not advertised

`firstOrderOffer()` (`lib/first-order-offer.ts`) returns null when the
promo-code field is switched off at checkout, or when the code or label is
blank. In that case the popup signup still records consent in full and still
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

Fixtures live in `lib/first-order-welcome-fixtures.ts`. The terms in
`with-verified-terms` are **illustrative samples**, not the live promotion's
terms, and are labelled as such so they cannot be copied into production by
mistake.
