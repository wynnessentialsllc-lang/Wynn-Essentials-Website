CREATE TABLE IF NOT EXISTS "crownprint_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"context" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Shop by CrownPrint™ Wynn-side session store. Holds only the consumer-safe
-- WynnMatchContext produced by the one-time Hair Wellness Lab exchange (product
-- keys, match classes, consumer-safe explanations, priority label, guidance, safe
-- links, ruleVersion, generatedAt) — never raw CrownPrint answers, CrownState /
-- CrownHistory detail, report content, user ids, scores, weights, thresholds, or
-- reason codes. Even though it is consumer-safe, it is per-shopper session data,
-- so lock it to server-side access with the same posture as the order, subscriber,
-- support, and review tables (see 0001_restrict_order_tables.sql): enable RLS with
-- no policy so non-owner roles are denied by default, while the app's owner/service
-- role still reads and writes.
ALTER TABLE "crownprint_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Revoke the default PUBLIC grant so a newly created role cannot read sessions
-- simply by existing. Guarded so this applies on any provider.
REVOKE ALL ON TABLE "crownprint_sessions" FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "crownprint_sessions" FROM "anon";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "crownprint_sessions" FROM "authenticated";
  END IF;
END
$$;
