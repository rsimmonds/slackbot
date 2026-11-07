-- Phase 4 security: API keys, API usage, seat invitations, report leads, concierge coaching.

-- ------------------------------------------------------------------ API keys
-- Company admins create keys for their own company. The key is shown once and stored only hashed.
GRANT INSERT ON public.api_keys TO app_user;
--> statement-breakpoint
CREATE POLICY api_keys_create ON public.api_keys FOR INSERT TO app_user
  WITH CHECK (company_id IN (SELECT app.my_admin_company_ids()) AND created_by = app.uid() AND revoked_at IS NULL);
--> statement-breakpoint

-- ------------------------------------------------------------------ API usage (system only)
ALTER TABLE public.api_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.api_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON public.api_requests TO app_user;
--> statement-breakpoint
CREATE POLICY api_requests_company ON public.api_requests FOR SELECT TO app_user
  USING (api_key_id IN (SELECT k.id FROM public.api_keys k
                        WHERE k.company_id IN (SELECT app.my_admin_company_ids()))
         OR app.has_role('admin'));
--> statement-breakpoint

-- ------------------------------------------------------------------ seat invitations
ALTER TABLE public.employer_invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.employer_invites FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.employer_invites TO app_user;
--> statement-breakpoint
GRANT UPDATE (revoked_at, updated_at) ON public.employer_invites TO app_user;
--> statement-breakpoint
CREATE POLICY employer_invites_admin ON public.employer_invites FOR SELECT TO app_user
  USING (company_id IN (SELECT app.my_admin_company_ids()));
--> statement-breakpoint
CREATE POLICY employer_invites_create ON public.employer_invites FOR INSERT TO app_user
  WITH CHECK (company_id IN (SELECT app.my_admin_company_ids()) AND invited_by = app.uid()
              AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at <= now() + interval '14 days');
--> statement-breakpoint
CREATE POLICY employer_invites_revoke ON public.employer_invites FOR UPDATE TO app_user
  USING (company_id IN (SELECT app.my_admin_company_ids()) AND accepted_at IS NULL)
  WITH CHECK (company_id IN (SELECT app.my_admin_company_ids()));
--> statement-breakpoint

-- Accepting: the signed-in user's own email must match the invite. Adds the employer role and the
-- seat atomically. Returns the company id, or NULL if the token is unknown, used, revoked or expired.
CREATE OR REPLACE FUNCTION app.accept_employer_invite(p_token_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
DECLARE
  v_invite public.employer_invites;
  v_email text;
BEGIN
  IF app.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT email INTO v_email FROM public.users WHERE id = app.uid() AND deleted_at IS NULL;
  SELECT * INTO v_invite FROM public.employer_invites
   WHERE token_hash = p_token_hash AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
   FOR UPDATE;
  IF v_invite.id IS NULL OR lower(v_invite.email) <> lower(v_email) THEN RETURN NULL; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (app.uid(), 'employer') ON CONFLICT DO NOTHING;
  INSERT INTO public.employer_members (user_id, company_id, seat_role)
  SELECT app.uid(), v_invite.company_id, v_invite.seat_role
   WHERE NOT EXISTS (SELECT 1 FROM public.employer_members
                      WHERE user_id = app.uid() AND company_id = v_invite.company_id);
  UPDATE public.employer_invites SET accepted_at = now(), updated_at = now() WHERE id = v_invite.id;
  RETURN v_invite.company_id;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.accept_employer_invite(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.accept_employer_invite(text) TO app_user;
--> statement-breakpoint

-- ------------------------------------------------------------------ report leads (system writes; editors read)
ALTER TABLE public.report_downloads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.report_downloads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON public.report_downloads TO app_user;
--> statement-breakpoint
CREATE POLICY report_downloads_editorial ON public.report_downloads FOR SELECT TO app_user
  USING (app.is_editorial());
--> statement-breakpoint

-- ------------------------------------------------------------------ concierge coaching
ALTER TABLE public.coaching_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.coaching_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.coaching_requests TO app_user;
--> statement-breakpoint
GRANT UPDATE (status, talent_partner_id, scheduled_at, updated_at) ON public.coaching_requests TO app_user;
--> statement-breakpoint
CREATE POLICY coaching_owner_select ON public.coaching_requests FOR SELECT TO app_user
  USING (user_id = app.uid() OR app.is_talent());
--> statement-breakpoint
CREATE POLICY coaching_owner_insert ON public.coaching_requests FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.has_role('candidate') AND status = 'requested'
              AND talent_partner_id IS NULL AND scheduled_at IS NULL);
--> statement-breakpoint
-- Candidates may cancel their own request; talent partners take and schedule them.
CREATE POLICY coaching_owner_cancel ON public.coaching_requests FOR UPDATE TO app_user
  USING (user_id = app.uid() AND status IN ('requested', 'scheduled'))
  WITH CHECK (user_id = app.uid() AND status = 'cancelled');
--> statement-breakpoint
CREATE POLICY coaching_talent ON public.coaching_requests FOR UPDATE TO app_user
  USING (app.is_talent())
  WITH CHECK (app.is_talent() AND (talent_partner_id IS NULL OR talent_partner_id = app.uid()));
