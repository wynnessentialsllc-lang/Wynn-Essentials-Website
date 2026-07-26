-- Live inventory, managed in /admin/inventory. Public storefront reads it via
-- /api/inventory. No customer PII, so no RLS lockdown is needed here.
CREATE TABLE IF NOT EXISTS "product_inventory" (
  "slug" text PRIMARY KEY NOT NULL,
  "sold_out" boolean DEFAULT false NOT NULL,
  "stock" integer,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
