-- Durable marketing-consent record for The Wynn Edit, plus the send-once claim
-- that keeps the welcome email idempotent.
--
-- Every column is nullable and additive, so this is safe to apply to the live
-- subscribers table without touching existing rows. Existing rows keep a NULL
-- consent_at / welcome_sent_at, which is honest: we do not know when they
-- consented and we have not sent them the new welcome.
--
-- Deliberately NOT stored: the signup IP address. The subscribers table is the
-- only place it would live, the privacy notice does not disclose collecting or
-- retaining IPs for marketing signup, and nothing in the app needs it once the
-- per-IP rate limiter (in-memory, request-scoped) has done its job.

-- When the affirmative marketing consent behind the current subscription was
-- given. Refreshed on a genuine re-subscription after an unsubscribe.
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "consent_at" timestamptz;

-- The version of the consent/privacy language in force when the box was ticked,
-- so a stored consent can always be tied back to what was actually shown.
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "consent_version" text;

-- Which form/placement captured the consent (e.g. "the-wynn-edit-footer"). This
-- is finer-grained than `source`, which records the marketing programme.
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "form_id" text;

-- Set the moment a welcome send is CLAIMED, by a conditional update that only
-- succeeds when it is still NULL. That claim is what makes the welcome email
-- send exactly once per subscription event, however many times the form, the
-- provider, or the database retries. Cleared again on a genuine re-subscription
-- so a returning subscriber is welcomed back.
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "welcome_sent_at" timestamptz;
