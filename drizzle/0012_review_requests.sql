-- Tracks when the post-purchase review-request email was sent for an order, so
-- the review-requests cron asks each customer exactly once.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "review_requested_at" timestamptz;
