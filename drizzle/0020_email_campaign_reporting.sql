CREATE TABLE IF NOT EXISTS "email_campaigns" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "subject" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "scheduled_at" timestamptz,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "campaign_deliveries" (
  "campaign_id" text NOT NULL REFERENCES "email_campaigns"("id") ON DELETE CASCADE,
  "email" text NOT NULL REFERENCES "subscribers"("email") ON DELETE CASCADE,
  "provider_message_id" text,
  "status" text NOT NULL DEFAULT 'claimed',
  "sent_at" timestamptz,
  "delivered_at" timestamptz,
  "opened_at" timestamptz,
  "bounced_at" timestamptz,
  "complained_at" timestamptz,
  "unsubscribed_at" timestamptz,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("campaign_id", "email")
);

CREATE UNIQUE INDEX IF NOT EXISTS "campaign_deliveries_provider_message_id_unique"
  ON "campaign_deliveries" ("provider_message_id")
  WHERE "provider_message_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "campaign_deliveries_campaign_id_idx" ON "campaign_deliveries" ("campaign_id");
CREATE INDEX IF NOT EXISTS "campaign_deliveries_email_idx" ON "campaign_deliveries" ("email");

CREATE TABLE IF NOT EXISTS "campaign_email_events" (
  "event_id" text PRIMARY KEY,
  "event_type" text NOT NULL,
  "provider_message_id" text,
  "received_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "email_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaign_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaign_email_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "email_campaigns", "campaign_deliveries", "campaign_email_events" FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "email_campaigns", "campaign_deliveries", "campaign_email_events" FROM "anon";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "email_campaigns", "campaign_deliveries", "campaign_email_events" FROM "authenticated";
  END IF;
END $$;
