CREATE TABLE IF NOT EXISTS "product_reviews" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_slug" text NOT NULL,
	"author" text NOT NULL,
	"location" text,
	"rating" integer NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"email" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Reviews hold contact PII (email) used only for moderation and buyer
-- verification, never shown publicly. Lock the table to server-side access with
-- the same posture as the support, subscriber, and order tables (see
-- 0001_restrict_order_tables.sql and 0006_support_messages.sql): enable RLS with
-- no policy so non-owner roles are denied by default, while the app's
-- owner/service role still reads and writes.
ALTER TABLE "product_reviews" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Revoke the default PUBLIC grant so a newly created role cannot read reviews
-- (and the emails they carry) simply by existing. Guarded so this applies on
-- any provider.
REVOKE ALL ON TABLE "product_reviews" FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "product_reviews" FROM "anon";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "product_reviews" FROM "authenticated";
  END IF;
END
$$;
