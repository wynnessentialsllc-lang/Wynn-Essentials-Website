-- Live sold-out overrides, managed in /admin/inventory. Public storefront reads
-- it via /api/inventory. No customer PII, so no RLS lockdown is needed here.
CREATE TABLE IF NOT EXISTS "product_inventory" (
  "slug" text PRIMARY KEY NOT NULL,
  "sold_out" boolean DEFAULT false NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
