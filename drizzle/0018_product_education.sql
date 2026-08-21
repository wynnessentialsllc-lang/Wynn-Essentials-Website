-- Send-once claim for the post-purchase product-education email.
--
-- Additive and nullable, so this is safe to apply to the live orders table
-- without touching existing rows. Every order that already exists starts NULL,
-- which is honest: none of them has been sent this email.
--
-- Stamped by a conditional UPDATE that only matches while the column is still
-- NULL, so two cron runs overlapping — a retry, a manual trigger, a redeploy
-- mid-run — cannot both claim the same order and send the customer two copies.
-- It is set whether or not the send succeeds, for the same reason
-- review_requested_at is: an order whose products have no education written for
-- them, or whose send was refused, must not be retried on every run forever.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "education_sent_at" timestamptz;

-- The cron scans for paid orders that have not been sent one yet, by ship or
-- order date. Partial on exactly that condition, so the index holds only the
-- orders still awaiting an email — a handful at any time — rather than growing
-- with the whole order history, and rows drop out of it as they are sent.
CREATE INDEX IF NOT EXISTS "orders_education_pending_idx"
  ON "orders" ("status", "shipped_at", "created_at")
  WHERE "education_sent_at" IS NULL;
