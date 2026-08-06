-- Records when a subscriber opted out of marketing email via an unsubscribe
-- link (CAN-SPAM). Nullable and additive, so it is safe to apply to the live
-- table without touching existing rows. Unsubscribing sets marketing_consent to
-- false and stamps this column.
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "unsubscribed_at" timestamptz;
