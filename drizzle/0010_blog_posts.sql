CREATE TABLE IF NOT EXISTS "blog_posts" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"body" text NOT NULL,
	"cover_image" text,
	"author" text DEFAULT 'Wynn Essentials' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Content is authored only through the token-gated /admin/blog editor. Lock the
-- table to server-side access with the same posture as the other tables: enable
-- RLS with no policy so non-owner roles are denied by default, and revoke the
-- default PUBLIC grant. Guarded so it applies on any provider.
ALTER TABLE "blog_posts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL ON TABLE "blog_posts" FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "blog_posts" FROM "anon";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "blog_posts" FROM "authenticated";
  END IF;
END
$$;
