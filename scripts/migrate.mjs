#!/usr/bin/env node
/**
 * Applies every SQL file in drizzle/ to the orders database, in order.
 *
 *   npm run db:migrate
 *
 * Each file is applied inside a transaction and recorded in `_migrations`, so
 * re-running only applies what is new. Reads ORDERS_DATABASE_URL from the
 * environment, falling back to .env.local for local runs.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import postgres from "postgres";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

// Migrations run DDL, so prefer the direct (non-pooling) connection. A
// transaction pooler can route statements across different backends and does
// not reliably hold advisory state for a multi-statement DDL transaction.
const CANDIDATES = [
  "ORDERS_DATABASE_POSTGRES_URL_NON_POOLING",
  "ORDERS_DATABASE_URL_NON_POOLING",
  "ORDERS_DATABASE_POSTGRES_URL",
  "ORDERS_DATABASE_URL",
  "DATABASE_URL",
];

const envFile = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const fromFile = name => envFile.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");

const chosen = CANDIDATES.find(name => process.env[name] || fromFile(name));
const url = chosen && (process.env[chosen] || fromFile(chosen));

// When invoked as part of a build (npm run db:migrate:deploy passes this flag),
// a missing connection string must not fail the build: an environment that has
// no database wired simply has nothing to migrate. The interactive command has
// no flag and still treats a missing URL as a hard error.
const skipIfUnconfigured = process.argv.includes("--skip-if-unconfigured");

if (!url) {
  if (skipIfUnconfigured) {
    console.warn(`\n  · No orders database connection string found — skipping migrations.
    Set one of ${CANDIDATES.join(", ")} to run them.\n`);
    process.exit(0);
  }
  console.error(`\n  ✗ No orders database connection string found.
    Checked the environment and .env.local for:
      ${CANDIDATES.join("\n      ")}

    If Neon is connected in Vercel, pull the variables down first:
      npx vercel env pull .env.local\n`);
  process.exit(1);
}
console.log(`\n  Using ${chosen}${chosen.includes("NON_POOLING") ? "" : "  (direct connection preferred for DDL)"}`);

const sql = postgres(url, { prepare: false, max: 1 });

try {
  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  const applied = new Set((await sql`SELECT name FROM _migrations`).map(r => r.name));
  const files = readdirSync(resolve(root, "drizzle")).filter(f => f.endsWith(".sql")).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  · ${file} (already applied)`);
      continue;
    }
    const body = readFileSync(resolve(root, "drizzle", file), "utf8");
    // Drizzle's marker separates statements, but postgres.js can run the whole
    // file as one simple query, which keeps DO $$ blocks intact.
    await sql.begin(async tx => {
      await tx.unsafe(body.split("--> statement-breakpoint").join("\n"));
      await tx`INSERT INTO _migrations (name) VALUES (${file})`;
    });
    console.log(`  + ${file}`);
    count++;
  }

  console.log(`\n  ✓ ${count} migration${count === 1 ? "" : "s"} applied, ${files.length - count} already present.\n`);
} catch (error) {
  console.error(`\n  ✗ Migration failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
