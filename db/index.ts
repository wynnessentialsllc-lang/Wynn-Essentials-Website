import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Server-only. These connection strings carry full write access to customer
// order data and must never be exposed to the browser, so none is prefixed
// with NEXT_PUBLIC_.
//
// First match wins. ORDERS_DATABASE_POSTGRES_URL is what the Vercel/Neon
// integration injects; the rest keep this layer portable to any other Postgres
// host without a code change.
const CONNECTION_ENV = [
  "ORDERS_DATABASE_POSTGRES_URL",
  "ORDERS_DATABASE_URL",
  "DATABASE_URL",
];

let client: ReturnType<typeof postgres> | null = null;

/**
 * Drizzle client for the orders database.
 *
 * Uses the provider's transaction pooler. `prepare: false` is required because
 * transaction-mode pooling does not keep a session across statements, and a
 * small pool avoids exhausting connections when many serverless functions run
 * concurrently.
 */
export function getDb() {
  const url = CONNECTION_ENV.map(name => process.env[name]).find(Boolean);
  if (!url) {
    throw new Error(
      `No orders database connection string found. Set one of ${CONNECTION_ENV.join(", ")} to the pooled connection string before handling checkout webhooks.`
    );
  }
  client ??= postgres(url, { prepare: false, max: 1, idle_timeout: 20 });
  return drizzle(client, { schema });
}
