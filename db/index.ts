import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Server-only. This connection string carries full write access to customer
// order data and must never be exposed to the browser, so it is deliberately
// not prefixed with NEXT_PUBLIC_.
const CONNECTION_ENV = "ORDERS_DATABASE_URL";

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
  const url = process.env[CONNECTION_ENV];
  if (!url) {
    throw new Error(
      `${CONNECTION_ENV} is not set. Point it at the orders database's pooled connection string before handling checkout webhooks.`
    );
  }
  client ??= postgres(url, { prepare: false, max: 1, idle_timeout: 20 });
  return drizzle(client, { schema });
}
