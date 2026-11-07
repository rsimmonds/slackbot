-- Phase 2 security: uploads are owner-only; data requests are created by their owner and
-- completed only by the system (owner connection).

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.files FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.files TO app_user;
--> statement-breakpoint
GRANT UPDATE (deleted_at, updated_at) ON public.files TO app_user;
--> statement-breakpoint
-- No staff policy: not even admins read someone's résumé through the app.
CREATE POLICY files_owner ON public.files FOR ALL TO app_user
  USING (owner_id = app.uid() AND deleted_at IS NULL)
  WITH CHECK (owner_id = app.uid());
--> statement-breakpoint

ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.data_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.data_requests TO app_user;
--> statement-breakpoint
GRANT UPDATE (status, updated_at) ON public.data_requests TO app_user;
--> statement-breakpoint
CREATE POLICY data_requests_owner_select ON public.data_requests FOR SELECT TO app_user
  USING (user_id = app.uid() OR app.has_role('admin'));
--> statement-breakpoint
CREATE POLICY data_requests_owner_insert ON public.data_requests FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND status = 'pending' AND due_at <= now() + interval '30 days');
--> statement-breakpoint
-- Owners may cancel a pending request; only the system completes one.
CREATE POLICY data_requests_owner_cancel ON public.data_requests FOR UPDATE TO app_user
  USING (user_id = app.uid() AND status = 'pending')
  WITH CHECK (user_id = app.uid() AND status = 'cancelled');
