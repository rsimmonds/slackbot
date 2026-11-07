ALTER TABLE "report_downloads" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "report_downloads" ADD COLUMN "newsletter_opt_in" boolean DEFAULT false NOT NULL;