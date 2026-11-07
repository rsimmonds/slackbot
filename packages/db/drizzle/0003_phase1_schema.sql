CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_item_status" AS ENUM('new', 'irrelevant', 'drafted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('newsroom', 'wire', 'edgar', 'submission');--> statement-breakpoint
ALTER TYPE "public"."listing_status" ADD VALUE 'rejected';--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "source_kind" NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"publisher" text,
	"published_at" timestamp with time zone,
	"content_hash" text NOT NULL,
	"excerpt" text,
	"status" "source_item_status" DEFAULT 'new' NOT NULL,
	"classification" jsonb,
	"move_id" uuid,
	"submitted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_items_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "takeaways" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "checkout_ref" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "moderated_by" uuid;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "moderated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "moderation_note" text;--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "raw_source" text;--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "moves" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "moves" ADD COLUMN "previous_role" text;--> statement-breakpoint
ALTER TABLE "moves" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "moves" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD COLUMN "last_alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "confirm_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "manage_token" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "market" "market";--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "preferences" jsonb DEFAULT '{"frequency":"weekly","topics":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "consent_text" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "unsubscribed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_to_idx" ON "email_outbox" USING btree ("to_email","created_at");--> statement-breakpoint
CREATE INDEX "source_items_status_idx" ON "source_items" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moves" ADD CONSTRAINT "moves_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_checkout_ref_unique" UNIQUE("checkout_ref");--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_confirm_token_unique" UNIQUE("confirm_token");--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_manage_token_unique" UNIQUE("manage_token");