CREATE TABLE IF NOT EXISTS "subscribers" (
	"email" text PRIMARY KEY NOT NULL,
	"phone" text,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"consent_text" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Newsletter ("The Wynn Edit") signups hold contact PII: email and phone. Lock
-- the table to server-side access with the same posture as the order tables
-- (see 0001_restrict_order_tables.sql): enable RLS with no policy so non-owner
-- roles are denied by default, while the app's owner/service role still writes.
ALTER TABLE "subscribers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Revoke the default PUBLIC grant so a newly created role cannot read signups
-- simply by existing. Guarded so this applies on any provider.
REVOKE ALL ON TABLE "subscribers" FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "subscribers" FROM "anon";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "subscribers" FROM "authenticated";
  END IF;
END
$$;
