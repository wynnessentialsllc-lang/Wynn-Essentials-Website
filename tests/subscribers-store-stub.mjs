// In-memory stand-in for db/ used by the subscribe and unsubscribe routes under
// test. It is deliberately NOT a general Drizzle emulator: it implements only
// the handful of statement shapes those two routes build, and it implements the
// parts that matter to correctness — ON CONFLICT DO NOTHING, and an UPDATE whose
// WHERE clause decides whether a row is returned — faithfully, because those are
// exactly the claims that make the welcome email send once.
//
// Every statement runs to completion before the next begins (the routes await
// each one), so a single-threaded map is an accurate model of the ordering a
// real transaction pooler would give these single-statement writes. Concurrency
// is exercised by interleaving awaited calls in the test itself.

export const store = new Map();

// Set to a message to make the next statement throw, so the routes' failure
// paths can be exercised.
export let failNext = null;
export function failOnce(message) { failNext = message; }
export function reset() { store.clear(); failNext = null; }

function boom() {
  if (failNext) {
    const message = failNext;
    failNext = null;
    throw new Error(message);
  }
}

// Column identity is carried by the schema objects the routes import, so the
// stub matches on the property names those objects expose.
const KEY = Symbol("column");
const column = (name) => ({ [KEY]: name });

export const subscribers = {
  email: column("email"),
  phone: column("phone"),
  marketingConsent: column("marketingConsent"),
  consentText: column("consentText"),
  source: column("source"),
  createdAt: column("createdAt"),
  updatedAt: column("updatedAt"),
  unsubscribedAt: column("unsubscribedAt"),
  consentAt: column("consentAt"),
  consentVersion: column("consentVersion"),
  formId: column("formId"),
  welcomeSentAt: column("welcomeSentAt"),
};

// --- predicate builders, matching drizzle-orm's exported helpers -------------
export const eq = (col, value) => (row) => row[col[KEY]] === value;
export const isNotNull = (col) => (row) => row[col[KEY]] != null;
export const isNull = (col) => (row) => row[col[KEY]] == null;
export const and = (...ps) => (row) => ps.every((p) => p(row));
export const or = (...ps) => (row) => ps.some((p) => p(row));

function thenable(run) {
  // Drizzle query builders are lazy thenables; awaiting one executes it.
  const promise = () => Promise.resolve().then(run);
  return {
    then: (res, rej) => promise().then(res, rej),
    catch: (rej) => promise().catch(rej),
    finally: (f) => promise().finally(f),
  };
}

function insert() {
  const state = { values: null, conflict: null, update: null, returning: false };
  const api = {
    values(v) { state.values = v; return api; },
    onConflictDoNothing() { state.conflict = "nothing"; return api; },
    onConflictDoUpdate({ set }) { state.conflict = "update"; state.update = set; return api; },
    returning() { state.returning = true; return api; },
    ...thenable(() => {
      boom();
      const now = new Date();
      const existing = store.get(state.values.email);
      if (!existing) {
        store.set(state.values.email, { createdAt: now, updatedAt: now, unsubscribedAt: null, welcomeSentAt: null, ...state.values });
        return state.returning ? [{ email: state.values.email }] : [];
      }
      if (state.conflict === "update") {
        store.set(state.values.email, { ...existing, ...state.update });
        return state.returning ? [{ email: state.values.email }] : [];
      }
      // ON CONFLICT DO NOTHING: no write, and nothing comes back — which is
      // what tells the route it did not win the new-subscriber claim.
      return [];
    }),
  };
  return api;
}

function update() {
  const state = { set: null, where: null, returning: false };
  const api = {
    set(s) { state.set = s; return api; },
    where(p) { state.where = p; return api; },
    returning() { state.returning = true; return api; },
    ...thenable(() => {
      boom();
      const hits = [];
      for (const [email, row] of store) {
        if (state.where && !state.where(row)) continue;
        store.set(email, { ...row, ...state.set });
        hits.push({ email });
      }
      return state.returning ? hits : [];
    }),
  };
  return api;
}

function select(columns) {
  const state = { where: null, limit: Infinity };
  const api = {
    from() { return api; },
    where(p) { state.where = p; return api; },
    limit(n) { state.limit = n; return api; },
    ...thenable(() => {
      boom();
      const rows = [...store.values()].filter((r) => !state.where || state.where(r)).slice(0, state.limit);
      return columns ? rows.map((r) => Object.fromEntries(Object.keys(columns).map((k) => [k, r[k]]))) : rows;
    }),
  };
  return api;
}

export function getDb() {
  boom();
  return { insert, update, select };
}
