-- Adds the stock count to product_inventory for anyone who created the table
-- before it had this column. Safe to run repeatedly.
ALTER TABLE "product_inventory" ADD COLUMN IF NOT EXISTS "stock" integer;
