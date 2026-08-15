# The restock waitlist — signup, consent, and the two emails

What happens when a shopper asks to hear that a sold-out product is back: what
is stored, what is sent, and where it is administered.

This is a **transactional** flow. It shares the `subscribers` table with The
Wynn Edit (`docs/wynn-edit-welcome.md`) but not its consent model, and the
difference between the two is the thing most worth understanding here.

## The two emails

Both already exist and both are automatic. Nothing has to be sent by hand on a
normal restock.

| | When it sends | Composed in | Sender name |
|---|---|---|---|
| **Waitlist confirmation** — "You're on the waitlist — *product*" | Immediately on every join, including a repeat join | `notifySubscriberWelcome()` in `lib/notify.ts` | Wynn Essentials Welcome |
| **Back in stock** — "*product* is back in stock" | When the product crosses sold-out → available | `notifyCustomerRestock()` in `lib/notify.ts` | Wynn Essentials Restock |

The back-in-stock email fires from `notifyRestockIfReopened()`
(`lib/restock-waitlist.ts`), which is called by both inventory server actions in
`app/admin/inventory/actions.ts`. It triggers on the **crossing**, not on the
state — saving an already-available product does not re-send, and selling out
does not send at all. Both routes into availability count: clearing the
sold-out flag, and raising a tracked stock count off zero.

## Consent: why "Waitlist only" is not a problem

The restock alert is a **one-time transactional message about one product that
she asked for by name**. That request is the permission. It is not marketing,
it does not require marketing consent, and nothing in the send path reads
`marketing_consent` — a test in `tests/restock-waitlist.test.mjs` pins that.

So a waitlist row showing **Consent: No** in `/admin/subscribers` (or
**Waitlist only** in `/admin/waitlist`) still gets told when the product
returns. That is the designed outcome, and the form promises exactly it:

> We'll email you once — when this item is back in stock. No marketing list, no
> obligation.

The waitlist form also carries an **optional, unticked** checkbox offering The
Wynn Edit. Ticking it is a separate affirmative opt-in and is the only thing on
that form that can create marketing consent. When it is ticked the signup
records a full consent record (`consent_at`, `consent_version`, `consent_text`,
`form_id = restock-waitlist-optional-opt-in`) and sends the newsletter welcome
with its unsubscribe machinery — a second, different message from the waitlist
confirmation.

The asymmetry to preserve, enforced by tests in
`tests/wynn-edit-welcome.test.mjs`:

- An opt-in **may upgrade** an existing row to a marketing subscriber, and may
  lift suppression from someone who previously unsubscribed.
- A waitlist signup **without** the box ticked must **never downgrade** one.
  Joining a waitlist is not a request to leave the newsletter, and it must not
  overwrite the consent behind a live subscription or resurrect a suppressed
  address.

## How a signup is stored

There is no separate waitlist table. A signup is a row in `subscribers` whose
`source` column names the product, and that column carries the whole state
machine:

| `source` | Meaning |
|---|---|
| `waitlist:<slug>` | Waiting to hear that `<slug>` is back |
| `waitlist-notified:<slug>` | Already told, this restock cycle |
| anything else | Not on any waitlist |

After the back-in-stock email is sent, the addresses that were emailed are moved
to `waitlist-notified:<slug>`, so the next sell-out/restock cycle starts a fresh
list and nobody is told twice about the same return. Someone who joins again
after that resets her source back to `waitlist:<slug>`.

The move is scoped to the addresses actually read, not re-run against the
source predicate — otherwise a shopper who joins while the sends are in flight
would be marked served without ever being emailed.

### Known limitation: one waitlist per address

`email` is the primary key of `subscribers` and `source` is a single column, so
**one address can sit on one product's waitlist at a time**. Joining a second
product's waitlist *moves* her rather than adding her, and she will only be told
about the most recent one.

Lifting this means a proper join table (`email`, `slug`, `joined_at`,
`notified_at`) rather than a column — worth doing if more than one product is
routinely sold out at once, but it is a schema change and a migration, not a
tweak.

## Administering it

`/admin/waitlist` groups every signup by product and shows, per product:
current availability, who is waiting, who has already been told, and whether
each person also opted in to the newsletter.

Two actions:

- **Notify now** — sends the back-in-stock email to everyone waiting on that
  product, by hand. This is the fallback for a product restocked without ever
  being marked sold out, a send that failed part-way, or a list that grew after
  the product reopened. It **refuses while the product is still sold out**,
  because the email says "it's back".
- **Remove** — takes one address off a product's waitlist. Only the waiting
  state is cleared; the subscriber row and any marketing consent on it are left
  exactly as they were.

The admin home badges the Waitlist section with the number of people **owed an
email** — waiting on a product that is available again. Someone waiting on a
product that is genuinely still sold out is not an action item.

## Files

| Path | Role |
|---|---|
| `lib/restock-waitlist.ts` | Source-column helpers, the send, and the reopened-crossing trigger |
| `app/api/subscribe/route.ts` | Signup, the optional opt-in, and the confirmation email |
| `app/admin/inventory/actions.ts` | Calls the trigger after every inventory write |
| `app/admin/waitlist/` | The admin view and its two server actions |
| `app/products/[slug]/WaitlistForm.tsx`, `app/WynnShop.tsx` | The two sold-out forms |
| `tests/restock-waitlist.test.mjs` | The send, the crossing, and the consent-independence rule |
| `tests/wynn-edit-welcome.test.mjs` | The opt-in's upgrade/never-downgrade rules |
