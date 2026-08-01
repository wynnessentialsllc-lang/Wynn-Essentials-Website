CREATE TABLE IF NOT EXISTS "abandoned_carts" (
	"email" text PRIMARY KEY NOT NULL,
	"visitor_id" text,
	"items" jsonb NOT NULL,
	"subtotal" bigint,
	"status" text DEFAULT 'pending' NOT NULL,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Holds a customer email used only to send a recovery reminder. Lock the table
-- to server-side access with the same posture as the order, subscriber, support,
-- and review tables: enable RLS with no policy so non-owner roles are denied by
-- default, and revoke the default PUBLIC grant. Guarded so it applies on any
-- provider.
ALTER TABLE "abandoned_carts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL ON TABLE "abandoned_carts" FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "abandoned_carts" FROM "anon";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "abandoned_carts" FROM "authenticated";
  END IF;
END
$$;
