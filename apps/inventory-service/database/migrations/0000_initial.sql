CREATE SCHEMA IF NOT EXISTS "inventory_schema";
--> statement-breakpoint
CREATE TABLE "inventory_schema"."dead_letter_events" (
	"message_id" text PRIMARY KEY NOT NULL,
	"original_topic" text NOT NULL,
	"envelope" jsonb NOT NULL,
	"reason" text NOT NULL,
	"attempts" integer NOT NULL,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_schema"."inbox_events" (
	"message_id" text PRIMARY KEY NOT NULL,
	"message_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_schema"."inventory_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"status" text NOT NULL,
	"failure_reason" text,
	"reserved_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reservations_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_schema"."outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"topic" text NOT NULL,
	"partition_key" text NOT NULL,
	"envelope" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"claimed_by" text,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_schema"."products" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_schema"."reservation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_schema"."stock" (
	"product_id" text PRIMARY KEY NOT NULL,
	"on_hand" integer NOT NULL,
	"reserved_qty" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_schema"."reservation_items" ADD CONSTRAINT "reservation_items_reservation_id_inventory_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "inventory_schema"."inventory_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_schema"."stock" ADD CONSTRAINT "stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "inventory_schema"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_events_unpublished_created_at_idx" ON "inventory_schema"."outbox_events" USING btree ("created_at") WHERE "inventory_schema"."outbox_events"."published_at" is null;