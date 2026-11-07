CREATE TYPE "public"."data_request_kind" AS ENUM('export', 'delete');--> statement-breakpoint
CREATE TYPE "public"."data_request_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."file_purpose" AS ENUM('resume', 'linkedin_pdf', 'media');--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "data_request_kind" NOT NULL,
	"status" "data_request_status" DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"result_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"purpose" "file_purpose" NOT NULL,
	"filename" "bytea" NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"provider" text DEFAULT 'local' NOT NULL,
	"content" "bytea",
	"storage_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "ideal_mandate" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "ai_notice_ack_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "max_questions" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "public_ref" text DEFAULT upper(substr(md5(gen_random_uuid()::text), 1, 8)) NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "mandate_id" uuid;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "document" jsonb;--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "comp_benchmark" jsonb;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_requests_status_idx" ON "data_requests" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_mandate_id_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_public_ref_unique" UNIQUE("public_ref");