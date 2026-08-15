-- The restock waitlist becomes a table of its own.
--
-- Until now a waitlist signup was encoded in `subscribers.source` as
-- 'waitlist:<slug>' (waiting) or 'waitlist-notified:<slug>' (already told).
-- Because `email` is the primary key of `subscribers` and `source` is a single
-- column, one address could sit on exactly ONE product's waitlist: joining a
-- second product moved her off the first, silently, and she was only ever told
-- about the most recent one.
--
-- A membership is a relationship between an address and a product, so it gets a
-- row of its own. `subscribers.source` reverts to what a source column should
-- be — where a contact came from — and stops carrying state.
CREATE TABLE IF NOT EXISTS "product_waitlist" (
  "email" text NOT NULL,
  "slug" text NOT NULL,
  "joined_at" timestamptz DEFAULT now() NOT NULL,
  -- NULL means still waiting. Stamped when the back-in-stock email goes out,
  -- and cleared again if she re-joins after a later sell-out, so each restock
  -- cycle notifies a fresh list.
  "notified_at" timestamptz,
  CONSTRAINT "product_waitlist_email_slug_pk" PRIMARY KEY ("email", "slug")
);
--> statement-breakpoint

-- The one hot query: everyone still waiting on a given product. Partial, because
-- rows that have already been notified are never in this lookup.
CREATE INDEX IF NOT EXISTS "product_waitlist_pending_idx"
  ON "product_waitlist" ("slug") WHERE "notified_at" IS NULL;
--> statement-breakpoint

-- Backfill everyone currently waiting. created_at is the closest thing the old
-- shape has to a join time.
INSERT INTO "product_waitlist" ("email", "slug", "joined_at", "notified_at")
SELECT "email", substring("source" from '^waitlist:(.+)$'), "created_at", NULL
FROM "subscribers"
WHERE "source" LIKE 'waitlist:%' AND substring("source" from '^waitlist:(.+)$') <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- And everyone already told, so a future restock of the same product cannot
-- email them a second time about a return they were notified of before.
INSERT INTO "product_waitlist" ("email", "slug", "joined_at", "notified_at")
SELECT "email", substring("source" from '^waitlist-notified:(.+)$'), "created_at", "updated_at"
FROM "subscribers"
WHERE "source" LIKE 'waitlist-notified:%' AND substring("source" from '^waitlist-notified:(.+)$') <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- `source` is provenance from here on, never state. Collapse the two-state
-- encoding to the single origin form so nothing is tempted to read it back as a
-- waitlist membership.
UPDATE "subscribers"
SET "source" = 'waitlist:' || substring("source" from '^waitlist-notified:(.+)$')
WHERE "source" LIKE 'waitlist-notified:%' AND substring("source" from '^waitlist-notified:(.+)$') <> '';
--> statement-breakpoint

-- Waitlist rows are customer email addresses, so this table gets the same
-- posture as `subscribers` and the order tables (0001, 0002): RLS on with no
-- policy, so non-owner roles are denied by default while the app's owner/service
-- role still reads and writes.
ALTER TABLE "product_waitlist" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Revoke the default PUBLIC grant so a newly created role cannot read the list
-- simply by existing. Guarded so this applies on any provider.
REVOKE ALL ON TABLE "product_waitlist" FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "product_waitlist" FROM "anon";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "product_waitlist" FROM "authenticated";
  END IF;
END
$$;
