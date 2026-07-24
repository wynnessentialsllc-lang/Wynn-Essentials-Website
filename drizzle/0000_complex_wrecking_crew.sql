CREATE TABLE "orders" (
	"session_id" text PRIMARY KEY NOT NULL,
	"order_reference" text,
	"event_id" text NOT NULL,
	"payment_intent_id" text,
	"status" text NOT NULL,
	"payment_status" text,
	"currency" text,
	"subtotal_amount" bigint,
	"discount_amount" bigint,
	"shipping_amount" bigint,
	"tax_amount" bigint,
	"total_amount" bigint,
	"customer_email" text,
	"customer_name" text,
	"shipping_address" jsonb,
	"items" jsonb NOT NULL,
	"fulfillment_status" text DEFAULT 'unfulfilled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"session_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
