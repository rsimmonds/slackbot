CREATE TYPE "public"."match_response" AS ENUM('pending', 'interested', 'declined', 'question');--> statement-breakpoint
CREATE TABLE "fairness_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"passed" boolean NOT NULL,
	"metrics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "candidate_response" "match_response" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "candidate_note" "bytea";--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "candidate_responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "search_id" uuid;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "placed_match_id" uuid;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "hired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "placement_comp" integer;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "placement_currency" "currency";--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "invoice_status" text;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE no action ON UPDATE no action;