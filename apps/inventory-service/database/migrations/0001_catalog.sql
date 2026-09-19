CREATE TABLE "inventory_schema"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory_schema"."product_categories" (
	"product_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "product_categories_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "inventory_schema"."products" ADD COLUMN "name" text DEFAULT 'Unnamed product' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_schema"."products" ADD COLUMN "price_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_schema"."products" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "inventory_schema"."products" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_schema"."products" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inventory_schema"."products" ALTER COLUMN "name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "inventory_schema"."products" ALTER COLUMN "price_cents" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "inventory_schema"."product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "inventory_schema"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_schema"."product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "inventory_schema"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_active_name_idx" ON "inventory_schema"."categories" USING btree (lower("name")) WHERE "inventory_schema"."categories"."deleted_at" is null;