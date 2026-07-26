-- First-party visitor analytics events. No customer PII (only a random
-- visitor id), and the public storefront writes to it, so no RLS lockdown.
CREATE TABLE IF NOT EXISTS "events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "visitor_id" text NOT NULL,
  "type" text NOT NULL,
  "path" text,
  "product_slug" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "events_created_at_idx" ON "events" ("created_at");
CREATE INDEX IF NOT EXISTS "events_type_idx" ON "events" ("type");
