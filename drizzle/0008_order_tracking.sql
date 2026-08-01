-- Shipping/tracking columns for the orders table. Marking an order shipped in
-- /admin/orders records the carrier + tracking number here and emails the
-- customer their tracking link. IF NOT EXISTS keeps this safe to re-run.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tracking_number" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "carrier" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipped_at" timestamp with time zone;
