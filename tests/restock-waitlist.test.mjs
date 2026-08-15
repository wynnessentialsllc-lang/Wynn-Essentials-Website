// The restock waitlist: who is waiting, who gets told, and who stops being
// told twice.
//
// What this suite is really protecting is the promise made on the sold-out
// form — "we'll email you once, when this item is back" — and the consent
// boundary underneath it. Two rules carry that promise, and both are easy to
// break by accident:
//
//   1. The back-in-stock email is transactional. It is owed to everyone on the
//      list, whether or not she ever agreed to marketing. A change that starts
//      filtering the send on marketing consent would silently drop most of the
//      list on the floor.
//   2. Being told is a one-way door for that restock cycle. The addresses that
//      were emailed move to the notified source, and only the ones actually
//      read are moved — somebody who joins mid-send must stay on the list.
//
// No Resend API key is set here, so lib/notify's sends short-circuit before any
// network call and the database transitions are what is under test.

import test from "node:test";
import assert from "node:assert/strict";

delete process.env.RESEND_API_KEY;
delete process.env.wynnessentials_site;

const {
  WAITLIST_PREFIX,
  NOTIFIED_PREFIX,
  waitlistSource,
  notifiedSource,
  slugFromSource,
  waitlistProductName,
  waitlistProductUrl,
  isSoldOut,
  notifyRestockWaitlist,
  notifyRestockIfReopened,
} = await import("../lib/restock-waitlist.ts");
const { products } = await import("../app/data.ts");

// --- the source column, which is the whole state machine ---------------------

test("a waiting signup and a notified one are told apart, and both name their product", () => {
  assert.equal(waitlistSource("grow-oil"), "waitlist:grow-oil");
  assert.equal(notifiedSource("grow-oil"), "waitlist-notified:grow-oil");
  assert.equal(slugFromSource("waitlist:grow-oil"), "grow-oil");
  assert.equal(slugFromSource("waitlist-notified:grow-oil"), "grow-oil");
});

test("the notified prefix is not mistaken for a waiting one", () => {
  // "waitlist-notified:x" starts with neither a clean "waitlist:" nor anything
  // ambiguous — if these two prefixes ever overlapped, everyone already told
  // would be told again on the next restock.
  assert.ok(!notifiedSource("x").startsWith(WAITLIST_PREFIX));
  assert.ok(NOTIFIED_PREFIX !== WAITLIST_PREFIX);
});

test("a source that is not a waitlist yields no slug", () => {
  for (const source of ["the-wynn-edit", "first-order-popup", "square-import", null, undefined, ""]) {
    assert.equal(slugFromSource(source), null, `${source} should not read as a waitlist`);
  }
});

test("a product name resolves from the catalog, and a retired product still reads as something", () => {
  const product = products[0];
  assert.equal(waitlistProductName(product.slug), `${product.name} ${product.subtitle}`);
  // A slug that has left the catalog must not render as "undefined undefined"
  // in an email — those addresses are still owed an answer.
  assert.equal(waitlistProductName("a-product-we-retired"), "a-product-we-retired");
});

test("the product link in the email is absolute and never a developer origin", () => {
  const url = waitlistProductUrl("grow-oil");
  assert.match(url, /^https:\/\//);
  assert.ok(url.endsWith("/products/grow-oil"));
  assert.doesNotMatch(url, /localhost|127\.0\.0\.1|\.vercel\.app/i);
});

// --- sold out, computed the same way the storefront computes it -------------

test("sold out means the flag OR tracked stock at zero", () => {
  assert.equal(isSoldOut({ soldOut: true, stock: null }), true);
  assert.equal(isSoldOut({ soldOut: false, stock: 0 }), true);
  assert.equal(isSoldOut({ soldOut: true, stock: 50 }), true, "the flag overrides a healthy count");
  assert.equal(isSoldOut({ soldOut: false, stock: null }), false, "untracked stock is unlimited, not zero");
  assert.equal(isSoldOut({ soldOut: false, stock: 3 }), false);
});

// --- the send ---------------------------------------------------------------

/**
 * Every string reachable inside a drizzle condition, which is where the bound
 * parameters of a WHERE clause live. Walked rather than serialized because a
 * drizzle column refers back to its table, so the structure is circular.
 */
function boundStrings(node, seen = new WeakSet(), found = []) {
  if (typeof node === "string") found.push(node);
  if (node === null || typeof node !== "object" || seen.has(node)) return found;
  seen.add(node);
  for (const value of Object.values(node)) boundStrings(value, seen, found);
  return found;
}

/**
 * Records the statements notifyRestockWaitlist builds. The function takes its
 * database as an argument, so the real one is simply never constructed here.
 */
function fakeDb(waiting) {
  const updates = [];
  return {
    updates,
    select: () => ({ from: () => ({ where: () => ({ limit: async () => waiting }) }) }),
    update: () => ({
      set: (values) => ({
        where: async (condition) => {
          updates.push({ values, bound: boundStrings(condition) });
        },
      }),
    }),
  };
}

test("nobody waiting means nothing sent and nothing written", async () => {
  const db = fakeDb([]);
  assert.equal(await notifyRestockWaitlist(db, "grow-oil"), 0);
  assert.equal(db.updates.length, 0, "an empty list must not still issue an UPDATE");
});

test("everyone waiting is emailed and moved to the notified source", async () => {
  const db = fakeDb([{ email: "a@example.com" }, { email: "b@example.com" }]);
  assert.equal(await notifyRestockWaitlist(db, "grow-oil"), 2);

  assert.equal(db.updates.length, 1);
  const [move] = db.updates;
  assert.equal(move.values.source, "waitlist-notified:grow-oil");
  assert.ok(move.values.updatedAt instanceof Date, "the move should stamp updated_at");
});

test("the move is scoped to the addresses actually read, not to the whole list", async () => {
  // Somebody who joins while the sends are in flight must stay on the list and
  // be told on the next run — marking her served without emailing her would
  // lose her silently. Re-running the source predicate would do exactly that,
  // so the UPDATE must name the addresses it read.
  const db = fakeDb([{ email: "a@example.com" }, { email: "b@example.com" }]);
  await notifyRestockWaitlist(db, "grow-oil");

  const { bound } = db.updates[0];
  assert.ok(bound.includes("a@example.com"), "the first address is not named in the WHERE clause");
  assert.ok(bound.includes("b@example.com"), "the second address is not named in the WHERE clause");
  // And the clause must not fall back to matching the source instead, which is
  // what would sweep up a late joiner.
  assert.ok(!bound.includes("waitlist:grow-oil"), "the WHERE clause re-runs the source predicate");
});

test("a waitlister with no marketing consent is still emailed", async () => {
  // The restock alert is transactional: she asked to be told about this one
  // product, and that request is the permission. Nothing in the send path may
  // read marketing_consent — the fake rows below do not even carry it, so a
  // send that started filtering on it would fail here.
  const db = fakeDb([{ email: "never-consented@example.com" }]);
  assert.equal(await notifyRestockWaitlist(db, "grow-oil"), 1);
  assert.equal(db.updates.length, 1);
});

// --- the automatic trigger --------------------------------------------------

const OUT = { soldOut: true, stock: null };
const IN = { soldOut: false, stock: 12 };

test("only the sold-out → available crossing notifies", async () => {
  for (const [before, after, shouldSend, why] of [
    [OUT, IN, true, "a genuine restock"],
    [IN, IN, false, "a stock edit on a product that was never out"],
    [OUT, OUT, false, "still sold out"],
    [IN, OUT, false, "selling out is not a restock"],
  ]) {
    const db = fakeDb([{ email: "a@example.com" }]);
    await notifyRestockIfReopened(db, "grow-oil", before, after);
    assert.equal(db.updates.length > 0, shouldSend, why);
  }
});

test("a restock that reopens by stock alone still notifies", async () => {
  // Raising a tracked count off zero is a restock even though the flag never
  // moved, and it is the path /admin/inventory's stock field takes.
  const db = fakeDb([{ email: "a@example.com" }]);
  await notifyRestockIfReopened(db, "grow-oil", { soldOut: false, stock: 0 }, { soldOut: false, stock: 6 });
  assert.equal(db.updates.length, 1);
});

test("a failure while notifying never propagates to the inventory update", async () => {
  // notifyRestockIfReopened is called from the middle of a server action that
  // has already written the new stock level. If it threw, the admin would see
  // an error for a save that in fact succeeded.
  const exploding = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => { throw new Error("database is down"); } }) }) }),
    update: () => { throw new Error("should not be reached"); },
  };
  await assert.doesNotReject(() => notifyRestockIfReopened(exploding, "grow-oil", OUT, IN));
});
