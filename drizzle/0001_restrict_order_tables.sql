-- Hand-maintained. Restricts the order tables to server-side access.
--
-- These tables hold customer PII: email, name, and shipping address.
--
-- What this actually guarantees, by provider:
--
--   Neon / plain Postgres — the app connects as the database owner, and an
--   owner bypasses RLS. So this does NOT restrict the application itself. The
--   real control there is that ORDERS_DATABASE_URL is server-only and never
--   prefixed with NEXT_PUBLIC_. Enabling RLS still matters as defense in depth:
--   any additional non-owner role added later (a read-only analytics user, a
--   BI connector) is denied by default instead of inheriting access.
--
--   Supabase — `anon` and `authenticated` are non-owner roles, so RLS with no
--   policies denies them outright while `service_role` (BYPASSRLS) still works.
--
-- Attaching any policy to these tables widens access. Do not add one without
-- deciding exactly which role should be able to read customer orders.

ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stripe_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Revoke the default PUBLIC grant so a newly created role cannot read orders
-- simply by existing. Guarded so this applies on any provider.
REVOKE ALL ON TABLE "orders", "stripe_events" FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "orders", "stripe_events" FROM "anon";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "orders", "stripe_events" FROM "authenticated";
  END IF;
END
$$;
