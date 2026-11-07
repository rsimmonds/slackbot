-- Extensions and the application role. Runs before the schema.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
-- app_user: the privilege set the web app runs with. NOLOGIN; a login role is granted it per environment.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
-- Tables use FORCE ROW LEVEL SECURITY. The migrating (owning) role must bypass RLS so seed scripts,
-- background jobs and the security-barrier views keep working. Fail loudly rather than silently.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Migrations must run as a role with BYPASSRLS (current: %)', current_user;
  END IF;
END $$;
