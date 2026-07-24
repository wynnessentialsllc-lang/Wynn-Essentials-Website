import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const url = p => new URL(p, import.meta.url);

/** Extracts a { table: Set<column> } map from any CREATE TABLE statements. */
function tableColumns(sql) {
  const tables = {};
  const re = /CREATE TABLE (?:IF NOT EXISTS )?`?(\w+)`?\s*\(([\s\S]*?)\n\s*\)/g;
  for (const [, name, body] of sql.matchAll(re)) {
    tables[name] = new Set(
      body
        .split("\n")
        .map(line => line.trim().replace(/,$/, ""))
        .filter(Boolean)
        .map(line => line.match(/^`?(\w+)`?\s/)?.[1])
        .filter(Boolean)
    );
  }
  return tables;
}

test("order tables are locked to server-side access only", async () => {
  const dir = url("../drizzle/");
  const files = (await readdir(dir)).filter(f => f.endsWith(".sql")).sort();
  assert.ok(files.length, "expected at least one generated migration");
  const sql = (await Promise.all(files.map(f => readFile(new URL(f, dir), "utf8")))).join("\n");

  // Orders carry customer email, name, and shipping address. Both tables must
  // have RLS on, and no policy may exist that would expose them to the anon key.
  for (const table of Object.keys(tableColumns(sql))) {
    assert.match(
      sql,
      new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`, "i"),
      `"${table}" holds customer data and must have row level security enabled`
    );
  }
  assert.doesNotMatch(sql, /CREATE POLICY/i, "a policy would widen access beyond the service role");
});

test("the database connection string is never exposed to the browser", async () => {
  const [dbSrc, migrateSrc, envExample] = await Promise.all([
    readFile(url("../db/index.ts"), "utf8"),
    readFile(url("../scripts/migrate.mjs"), "utf8"),
    readFile(url("../.env.example"), "utf8"),
  ]);

  // A NEXT_PUBLIC_ prefix would inline the credential into the client bundle.
  for (const [name, src] of [["db/index.ts", dbSrc], ["scripts/migrate.mjs", migrateSrc], [".env.example", envExample]]) {
    assert.doesNotMatch(src, /NEXT_PUBLIC_[A-Z_]*(DATABASE|POSTGRES|SUPABASE|NEON)/, `${name} must not expose a database credential to the browser`);
  }
  assert.match(dbSrc, /ORDERS_DATABASE_POSTGRES_URL/);

  // DDL must not run through the transaction pooler.
  assert.match(migrateSrc, /ORDERS_DATABASE_POSTGRES_URL_NON_POOLING/);
  assert.ok(
    migrateSrc.indexOf("ORDERS_DATABASE_POSTGRES_URL_NON_POOLING") < migrateSrc.indexOf('"ORDERS_DATABASE_POSTGRES_URL"'),
    "the non-pooling connection must be preferred over the pooled one for migrations"
  );
});

test("webhook records orders idempotently", async () => {
  const src = await readFile(url("../app/api/stripe/webhook/route.ts"), "utf8");

  // The event id must be claimed before the order is written, or a Stripe
  // redelivery would create a duplicate order.
  const claim = src.indexOf("claimEvent(db, event, sessionId)");
  const insert = src.indexOf("insert(orders)");
  assert.ok(claim > -1, "expected an event-claim step");
  assert.ok(insert > -1, "expected orders to be inserted");
  assert.ok(claim < insert, "the event id must be claimed before the order is written");

  assert.match(src, /onConflictDoNothing\(\)/, "the event claim must rely on a unique constraint");
  assert.match(src, /status:\s*500/, "a failed write must return 500 so Stripe retries");
});

test("checkout honors the advertised free-shipping threshold", async () => {
  const [checkout, data, config] = await Promise.all([
    readFile(url("../app/api/stripe/create-checkout-session/route.ts"), "utf8"),
    readFile(url("../app/data.ts"), "utf8"),
    readFile(url("../lib/commerce-config.ts"), "utf8"),
  ]);

  // The subtotal that selects the shipping rate must come from the server
  // catalog, never from the client payload.
  assert.match(checkout, /subtotalCents \+= Math\.round\(\(product\.price/);
  assert.match(checkout, /qualifiesForFreeShipping/);

  const advertised = data.match(/shippingThreshold:\s*(\d+)/)?.[1];
  const enforced = config.match(/freeShippingThresholdCents:\s*(\d+)/)?.[1];
  assert.ok(advertised && enforced, "expected both thresholds to be declared");
  assert.equal(
    Number(enforced),
    Number(advertised) * 100,
    "the threshold advertised on the storefront must match the one checkout enforces"
  );
});
