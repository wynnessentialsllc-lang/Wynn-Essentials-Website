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

A membership is a relationship between an address and a product, so it is a row
of its own in **`product_waitlist`** (`drizzle/0019_product_waitlist.sql`):

| Column | Meaning |
|---|---|
| `email` + `slug` | Composite primary key. One row per address per product, so a repeat join upserts rather than duplicating. |
| `joined_at` | When she asked. Refreshed on a re-join. |
| `notified_at` | `NULL` while she is waiting; stamped when the back-in-stock email goes out. |

**An address can wait on as many products as it likes.** Joining a second
product's waitlist adds a row; it does not disturb the first.

After the back-in-stock email is sent, the addresses that were emailed get
`notified_at` stamped, so the next sell-out/restock cycle notifies a fresh list
and nobody is told twice about the same return. Someone who joins again after
that has `notified_at` cleared, which puts her back in line.

Two scoping rules make that safe, both pinned by tests:

- The stamp names the **addresses actually read**, rather than re-running the
  predicate — otherwise a shopper who joins while the sends are in flight would
  be marked served without ever being emailed.
- The stamp is also scoped **by slug** — otherwise notifying one product would
  mark her served on every other product she is waiting on.

### `subscribers.source` is provenance, not state

A waitlist signup still upserts a `subscribers` row as the contact record, with
`source = 'waitlist:<slug>'`. That value records **where a contact came from**
and nothing reads it back as membership. It is allowed to move when she joins a
second waitlist; both memberships survive it.

This is the coupling that used to be the bug. Before
`0019_product_waitlist.sql` the membership *was* `subscribers.source`, and
because `email` is that table's primary key and `source` is a single column, one
address could sit on exactly one product's waitlist — joining a second moved her
off the first, silently, and she was only ever told about the most recent one.
The migration backfills both old states (`waitlist:` → waiting,
`waitlist-notified:` → notified, preserving the notification time) and collapses
`source` to the single origin form.

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
- **Remove** — deletes one `(address, product)` membership. Scoped to that pair,
  so it cannot disturb anything else she is waiting on, nor her subscriber row
  and any marketing consent on it.

The admin home badges the Waitlist section with the number of people **owed an
email** — waiting on a product that is available again. Someone waiting on a
product that is genuinely still sold out is not an action item.

## Files

| Path | Role |
|---|---|
| `drizzle/0019_product_waitlist.sql` | The table, its RLS lockdown, and the backfill from the old encoding |
| `lib/restock-waitlist.ts` | The send and the reopened-crossing trigger |
| `app/api/subscribe/route.ts` | Signup, the membership upsert, the optional opt-in, and the confirmation email |
| `app/admin/inventory/actions.ts` | Calls the trigger after every inventory write |
| `app/admin/waitlist/` | The admin view and its two server actions |
| `app/products/[slug]/WaitlistForm.tsx`, `app/WynnShop.tsx` | The two sold-out forms |
| `tests/restock-waitlist.test.mjs` | The send, the crossing, and the consent-independence rule |
| `tests/wynn-edit-welcome.test.mjs` | The opt-in's upgrade/never-downgrade rules |
