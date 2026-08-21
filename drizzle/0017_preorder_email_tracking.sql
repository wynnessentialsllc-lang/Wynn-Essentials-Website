ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "preorder_processing_emailed_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "preorder_quality_emailed_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "preorder_shipped_emailed_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "preorder_confirmation_emailed_at" timestamp with time zone;
