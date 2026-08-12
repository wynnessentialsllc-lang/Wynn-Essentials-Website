# The Wynn Edit — signup, consent, and the welcome email

How a newsletter subscription is captured, what is recorded, and what is sent.
This is the marketing flow only; it shares no code path with order
confirmations, shipping notifications, or customer-service replies.

## Provider and list management

| | |
|---|---|
| Email provider | **Resend**, called directly over its REST API (`lib/notify.ts`). No SDK, no dashboard automation. |
| Subscriber store | The application's own Postgres `subscribers` table (`db/schema.ts`). Resend Audiences/Contacts are **not** used. |
| Opt-in model | **Single opt-in.** The marketing checkbox is the consent event; there is no confirmation-request email. |
| Welcome automation | Application-side only, in `app/api/subscribe/route.ts`. There is no provider-side welcome automation, so there is nothing to double up with. |
| Suppression | `subscribers.unsubscribed_at` + `marketing_consent = false`, set by `/api/unsubscribe`. Resend's own suppression list is untouched by this code. |

Because the list lives here rather than at the provider, "add to the audience"
and "send the welcome" are the same database write plus one API call — which is
what makes the send-once guarantee below possible.

## Consent recorded for each subscriber

Written only when the marketing checkbox is affirmatively ticked:

| Column | What it holds |
|---|---|
| `email` | Normalised (trimmed, lowercased). Primary key, so an address cannot be duplicated. |
| `marketing_consent` | `true` only while she is an active marketing subscriber. |
| `consent_text` | The **exact disclosure** rendered beside the checkbox (`brandConfig.consent`). |
| `consent_version` | The version of that language plus the privacy notice (`brandConfig.consentVersion`). |
| `consent_at` | When she ticked the box. Refreshed only on a genuine re-subscription. |
| `form_id` | The placement that captured it, e.g. `the-wynn-edit-newsletter-section`. |
| `source` | The marketing programme, e.g. `the-wynn-edit`. |
| `unsubscribed_at` | Set on opt-out, cleared only by fresh affirmative consent. |
| `welcome_sent_at` | The send-once claim (below). |

**IP address is deliberately not stored.** The privacy notice does not disclose
collecting or retaining IPs for marketing signup, and nothing needs it once the
per-request rate limiter has used it. Ticking the box is the consent record.

Marketing consent is separate from checkout: nothing in the checkout, account,
or transactional paths reads or writes `marketing_consent`, and a restock
waitlist signup (`source = waitlist:<slug>`) records **no** marketing consent
and can never upgrade an existing row's consent.

## Send-once guarantee

`welcome_sent_at` is claimed by whichever single statement wins, never by a
read-then-write:

1. **New subscriber** — `INSERT … ON CONFLICT DO NOTHING RETURNING`. The insert
   stamps `welcome_sent_at` in the same statement that creates the row.
2. **Genuine re-subscription** — `UPDATE … WHERE unsubscribed_at IS NOT NULL OR
   marketing_consent = false`. Lifts the suppression and claims the welcome
   together, so a returning subscriber is welcomed exactly once.
3. **Active but never welcomed** — `UPDATE … WHERE welcome_sent_at IS NULL`.
   Covers a contact imported from a previous platform and a signup whose
   welcome the provider definitively rejected.
4. **Otherwise** — refresh the disclosure record and send nothing.

A double-click, a retried `fetch`, a replayed request body, and two concurrent
submissions all converge on one welcome, because only one of those statements
can match. If delivery fails, the claim is released **only when we know nothing
was transmitted** (no API key, or an explicit rejection from Resend); an
ambiguous failure such as a socket timeout keeps the claim, so a retry can never
put a second copy in her inbox.

## What the storefront says

`/api/subscribe` answers with one of three statuses, and the form is replaced by
a matching confirmation:

| Status | Shown | Meaning |
|---|---|---|
| `subscribed` | "You're on the list." / "Good hair information is officially headed to your inbox." | Consent stored and Resend **accepted** the welcome. |
| `recorded` | "You're on the list." / "Your place on The Wynn Edit is saved…" | Consent stored, no send accepted. Deliberately claims no email. |
| `eligible` | "Thanks — you're all set." / "If this email is eligible, you'll receive the next edition." | Nothing to do. |

`eligible` is the answer for an already-active subscriber **and** for a
suppressed address, so the two cannot be told apart. A `subscribed` response
does confirm that one address was not previously active — the wording was
specified — so if list-membership probing ever becomes a concern, collapse
`subscribed` into `eligible` in `WynnEditSignup` and the endpoint becomes fully
non-enumerating.

## The email

Composed in `lib/wynn-edit-email.ts`, sent by `notifyWynnEditWelcome()`.

- 600px table layout, inline styles, fluid below 620px. The `<style>` block only
  stacks columns; the design reads without it.
- Every headline, benefit, CTA label, address, and the unsubscribe link is live
  text. Three images, all real Wynn Essentials photography already in `public/`,
  all absolute `https://wynnessentialsllc.us` URLs with descriptive alt text.
- Plain-text alternative with the same copy and the same links.
- `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  (RFC 8058), honoured by `/api/unsubscribe` with a plain 200.
- Reply-To is `NOTIFY_TO`, never a no-reply address.
- No discount, no promo code. There is no approved Wynn Edit incentive.

There is no manage-preferences link because there is no preference centre —
`/unsubscribe` is all/nothing. Add the link when a preference centre exists.

## Previews

```bash
npm run email:preview
```

Writes `build/email-previews/` (gitignored): the exact HTML, the plain text, and
— when playwright is available — desktop (640px), mobile (390px), and
images-blocked renders. It sends nothing, signs with a throwaway secret, and
never uses a developer's `NEXT_PUBLIC_SITE_URL`.

## Safe test send

The welcome only goes to an address that just gave consent, so testing is a real
signup — do it in a way that cannot reach a customer:

1. Point `.env.local` at a **non-production** database
   (`ORDERS_DATABASE_URL`), so no live subscriber row is touched.
2. Leave `NOTIFY_FROM` on `onboarding@resend.dev`. Until the sending domain is
   verified, Resend refuses to deliver to anyone except the Resend account's own
   address — the provider itself is the guardrail.
3. Set `UNSUBSCRIBE_SECRET` to any random value, and `RESEND_API_KEY` to a key
   from the Resend account.
4. `npm run dev`, open the storefront, and sign up **with the Resend account's
   own email address**. Tick the box.
5. Confirm: one email, correct subject, working unsubscribe link, and a second
   submission of the same address returns "you're all set" with no second email.

To check rendering only, with no send at all, use `npm run email:preview`.

## Deployment checklist

Nothing here requires a change in the Resend dashboard — there is no audience
and no provider-side automation to create. What is required:

- Apply `drizzle/0017_wynn_edit_consent.sql` (`npm run db:migrate`; the Vercel
  build already runs `db:migrate:deploy`).
- `UNSUBSCRIBE_SECRET` (or `CRON_SECRET`/`STRIPE_WEBHOOK_SECRET`) must be set,
  or the welcome will not send.
- `NEXT_PUBLIC_SITE_URL` should be `https://wynnessentialsllc.us` in production.
  If it is missing or points at localhost, the email falls back to the
  production origin rather than shipping a broken asset URL.
- Verify `wynnessentialsllc.us` as a sending domain in Resend and set
  `NOTIFY_FROM` to an address on it **before** any real subscriber signs up;
  until then the welcome will be attempted and rejected for every address other
  than the Resend account's own.
