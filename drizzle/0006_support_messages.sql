CREATE TABLE IF NOT EXISTS "support_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"order_number" text,
	"topic" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Support messages hold contact PII: customer name and email. Lock the table to
-- server-side access with the same posture as the order and subscriber tables
-- (see 0001_restrict_order_tables.sql): enable RLS with no policy so non-owner
-- roles are denied by default, while the app's owner/service role still writes.
ALTER TABLE "support_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Revoke the default PUBLIC grant so a newly created role cannot read messages
-- simply by existing. Guarded so this applies on any provider.
REVOKE ALL ON TABLE "support_messages" FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "support_messages" FROM "anon";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "support_messages" FROM "authenticated";
  END IF;
END
$$;
