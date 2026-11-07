-- The single FOR ALL policy on files hid soft-deleted rows. Postgres also checks the row an
-- UPDATE produces against the SELECT policy, so an owner could never soft-delete their own
-- upload. Split per command: owners read their own files (queries filter deleted_at), add new
-- ones, and may mark them deleted. Still no staff policy: nobody else reads someone's files
-- through the app.

DROP POLICY IF EXISTS files_owner ON public.files;
--> statement-breakpoint
CREATE POLICY files_owner_select ON public.files FOR SELECT TO app_user
  USING (owner_id = app.uid());
--> statement-breakpoint
CREATE POLICY files_owner_insert ON public.files FOR INSERT TO app_user
  WITH CHECK (owner_id = app.uid() AND deleted_at IS NULL);
--> statement-breakpoint
CREATE POLICY files_owner_soft_delete ON public.files FOR UPDATE TO app_user
  USING (owner_id = app.uid() AND deleted_at IS NULL)
  WITH CHECK (owner_id = app.uid());
