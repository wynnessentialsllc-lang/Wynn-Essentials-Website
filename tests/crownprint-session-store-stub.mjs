// In-memory stand-in for the orders database, used ONLY by the CrownPrint
// session store in lib/crownprint.ts (see the resolve hook in hwl-loader.mjs).
//
// Why it exists: `createMatchSession` persists the exchanged context to Postgres
// and returns false if it cannot. Without a database every connect attempt ends
// on TEMPORARILY_UNAVAILABLE, which would make a test of the connect callback
// unable to tell "the handoff was refused" apart from "the handoff worked and
// then storage failed" — precisely the distinction the Gate 1 regression is
// about. This makes storage succeed so the routing decision is what is measured.
//
// It is a stub, not a fake database: it stores rows in a Map and answers the
// three operations the session store performs. Nothing else in the app resolves
// to it.

export const rows = new Map();

const chain = (run) => {
  const self = {
    values: (v) => run("insert", v),
    from: () => self,
    where: () => self,
    limit: () => run("select"),
    then: (resolve, reject) => Promise.resolve(run("run")).then(resolve, reject),
  };
  return self;
};

export function getDb() {
  let pendingDelete = null;
  return {
    insert: () => chain((op, v) => {
      if (op === "insert") rows.set(v.id, v);
      return Promise.resolve();
    }),
    select: () => chain((op) => (op === "select" ? Promise.resolve([...rows.values()]) : Promise.resolve())),
    delete: () => {
      pendingDelete = true;
      return chain(() => {
        if (pendingDelete) rows.clear();
        return Promise.resolve();
      });
    },
  };
}

/** Forget every stored session, so one test cannot see another's. */
export const reset = () => rows.clear();

// The schema module the session store imports alongside `getDb`. Only the table
// handle's identity matters here; the stub never reads its columns.
export const crownprintSessions = { __table: "crownprint_sessions" };
