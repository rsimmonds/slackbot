-- Row-level security, grants, integrity triggers and the employer-facing views.
--
-- Model: the web app connects as a login role that inherits app_user. Every request runs inside a
-- transaction that sets app.user_id (uuid, empty for anonymous) and app.roles (comma list).
-- A claimed role only counts if it is also present in user_roles, so a forged app.roles cannot
-- escalate. Employers never read candidate tables; they read employer_match_view.

CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO app_user;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint

-- ------------------------------------------------------------------ helpers

CREATE OR REPLACE FUNCTION app.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.claimed_roles() RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_to_array(nullif(current_setting('app.roles', true), ''), ','), '{}'::text[])
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.has_role(r text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.uid() IS NOT NULL
     AND r = ANY (app.claimed_roles())
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = app.uid() AND ur.role::text = r)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.is_staff() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.has_role('editor') OR app.has_role('talent_partner') OR app.has_role('admin')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.is_talent() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.has_role('talent_partner') OR app.has_role('admin')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.is_editorial() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.has_role('editor') OR app.has_role('admin')
$$;
--> statement-breakpoint
-- Companies the current user is an employer member of (empty unless they hold the employer role).
CREATE OR REPLACE FUNCTION app.my_company_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
  SELECT em.company_id FROM public.employer_members em
  WHERE em.user_id = app.uid() AND app.has_role('employer')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.my_admin_company_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
  SELECT em.company_id FROM public.employer_members em
  WHERE em.user_id = app.uid() AND em.seat_role IN ('owner', 'admin') AND app.has_role('employer')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.my_profile_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
  SELECT p.id FROM public.candidate_profiles p WHERE p.user_id = app.uid()
$$;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_user;
--> statement-breakpoint

-- ------------------------------------------------------------------ integrity triggers

CREATE OR REPLACE FUNCTION app.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at' AND tb.table_type = 'BASE TABLE'
      AND c.table_name <> 'audit_log'
  LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION app.set_updated_at()', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- audit_log is append-only for everyone, including the owner.
CREATE OR REPLACE FUNCTION app.audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION app.audit_log_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION app.audit_log_immutable();
--> statement-breakpoint

-- Listings copy company_id from their mandate and cannot go live without a comp range.
-- SECURITY DEFINER so the copy is always correct; the insert/update policy then checks ownership
-- against the copied company_id, so a foreign mandate is rejected.
CREATE OR REPLACE FUNCTION app.listings_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m record;
BEGIN
  SELECT company_id, comp_min, comp_max INTO m FROM public.mandates WHERE id = NEW.mandate_id;
  NEW.company_id := m.company_id;
  IF NEW.status = 'live' AND (m.comp_min IS NULL OR m.comp_max IS NULL) THEN
    RAISE EXCEPTION 'A live listing needs a comp range on its mandate' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.listings_sync() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER listings_sync BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION app.listings_sync();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.mandates_comp_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.comp_min IS NULL OR NEW.comp_max IS NULL)
     AND EXISTS (SELECT 1 FROM public.listings l WHERE l.mandate_id = NEW.id AND l.status = 'live') THEN
    RAISE EXCEPTION 'Cannot remove comp from a mandate with a live listing' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'A mandate cannot move between companies' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.mandates_comp_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER mandates_comp_guard BEFORE UPDATE ON public.mandates
  FOR EACH ROW EXECUTE FUNCTION app.mandates_comp_guard();
--> statement-breakpoint

-- ------------------------------------------------------------------ enable + force RLS everywhere

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\_\_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- ------------------------------------------------------------------ identity

GRANT SELECT ON public.users TO app_user;
--> statement-breakpoint
GRANT UPDATE (display_name, last_active_at, updated_at) ON public.users TO app_user;
--> statement-breakpoint
CREATE POLICY users_select ON public.users FOR SELECT TO app_user
  USING (id = app.uid() OR app.has_role('admin'));
--> statement-breakpoint
CREATE POLICY users_update ON public.users FOR UPDATE TO app_user
  USING (id = app.uid()) WITH CHECK (id = app.uid());
--> statement-breakpoint

-- user_roles must not reference has_role (it is what has_role reads).
GRANT SELECT ON public.user_roles TO app_user;
--> statement-breakpoint
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO app_user
  USING (user_id = app.uid());
--> statement-breakpoint

GRANT SELECT, UPDATE ON public.companies TO app_user;
--> statement-breakpoint
CREATE POLICY companies_select ON public.companies FOR SELECT TO app_user
  USING (deleted_at IS NULL OR app.has_role('admin'));
--> statement-breakpoint
CREATE POLICY companies_update ON public.companies FOR UPDATE TO app_user
  USING (id IN (SELECT app.my_admin_company_ids()) OR app.has_role('admin'))
  WITH CHECK (id IN (SELECT app.my_admin_company_ids()) OR app.has_role('admin'));
--> statement-breakpoint

GRANT SELECT ON public.employer_members TO app_user;
--> statement-breakpoint
CREATE POLICY employer_members_select ON public.employer_members FOR SELECT TO app_user
  USING (user_id = app.uid() OR app.has_role('admin'));
--> statement-breakpoint

-- ------------------------------------------------------------------ candidate data
-- Hidden means visible to no one but the owner. Talent partners see anonymous and open profiles.
-- Employers have no policy here at all.

GRANT SELECT, INSERT, UPDATE ON public.candidate_profiles TO app_user;
--> statement-breakpoint
CREATE POLICY candidate_profiles_select ON public.candidate_profiles FOR SELECT TO app_user
  USING (
    user_id = app.uid()
    OR (app.is_talent() AND visibility <> 'hidden' AND deleted_at IS NULL)
  );
--> statement-breakpoint
CREATE POLICY candidate_profiles_insert ON public.candidate_profiles FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.has_role('candidate'));
--> statement-breakpoint
CREATE POLICY candidate_profiles_update ON public.candidate_profiles FOR UPDATE TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_outcomes TO app_user;
--> statement-breakpoint
CREATE POLICY profile_outcomes_owner ON public.profile_outcomes FOR ALL TO app_user
  USING (profile_id IN (SELECT app.my_profile_ids()))
  WITH CHECK (profile_id IN (SELECT app.my_profile_ids()));
--> statement-breakpoint
CREATE POLICY profile_outcomes_talent ON public.profile_outcomes FOR SELECT TO app_user
  USING (app.is_talent() AND profile_id IN (
    SELECT p.id FROM public.candidate_profiles p WHERE p.visibility <> 'hidden' AND p.deleted_at IS NULL));
--> statement-breakpoint

GRANT SELECT, INSERT, DELETE ON public.profile_blocklist TO app_user;
--> statement-breakpoint
CREATE POLICY profile_blocklist_owner ON public.profile_blocklist FOR ALL TO app_user
  USING (profile_id IN (SELECT app.my_profile_ids()))
  WITH CHECK (profile_id IN (SELECT app.my_profile_ids()));
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.interview_sessions TO app_user;
--> statement-breakpoint
CREATE POLICY interview_sessions_owner ON public.interview_sessions FOR ALL TO app_user
  USING (owner_id = app.uid()) WITH CHECK (owner_id = app.uid());
--> statement-breakpoint
CREATE POLICY interview_sessions_talent ON public.interview_sessions FOR SELECT TO app_user
  USING (kind = 'mandate' AND app.is_talent());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.saved_searches TO app_user;
--> statement-breakpoint
GRANT DELETE ON public.saved_searches TO app_user;
--> statement-breakpoint
CREATE POLICY saved_searches_owner ON public.saved_searches FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
--> statement-breakpoint

GRANT SELECT, INSERT ON public.consents TO app_user;
--> statement-breakpoint
GRANT UPDATE (withdrawn_at, updated_at) ON public.consents TO app_user;
--> statement-breakpoint
CREATE POLICY consents_owner ON public.consents FOR ALL TO app_user
  USING (subject_user_id = app.uid()) WITH CHECK (subject_user_id = app.uid());
--> statement-breakpoint
CREATE POLICY consents_admin ON public.consents FOR SELECT TO app_user
  USING (app.has_role('admin'));
--> statement-breakpoint

-- ------------------------------------------------------------------ mandates and listings

GRANT SELECT, INSERT, UPDATE ON public.mandates TO app_user;
--> statement-breakpoint
CREATE POLICY mandates_select ON public.mandates FOR SELECT TO app_user
  USING (
    (deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM public.listings l WHERE l.mandate_id = mandates.id AND l.status = 'live' AND l.deleted_at IS NULL))
    OR company_id IN (SELECT app.my_company_ids())
    OR app.is_staff()
  );
--> statement-breakpoint
CREATE POLICY mandates_write ON public.mandates FOR INSERT TO app_user
  WITH CHECK (company_id IN (SELECT app.my_company_ids()) OR app.is_talent());
--> statement-breakpoint
CREATE POLICY mandates_update ON public.mandates FOR UPDATE TO app_user
  USING (company_id IN (SELECT app.my_company_ids()) OR app.is_talent())
  WITH CHECK (company_id IN (SELECT app.my_company_ids()) OR app.is_talent());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.listings TO app_user;
--> statement-breakpoint
CREATE POLICY listings_select ON public.listings FOR SELECT TO app_user
  USING (
    (status = 'live' AND deleted_at IS NULL)
    OR company_id IN (SELECT app.my_company_ids())
    OR app.is_staff()
  );
--> statement-breakpoint
-- Employers create drafts; only staff moderation (or the payment webhook, as owner) makes a listing live.
CREATE POLICY listings_insert ON public.listings FOR INSERT TO app_user
  WITH CHECK (
    (company_id IN (SELECT app.my_company_ids()) AND status IN ('draft', 'pending_payment'))
    OR app.has_role('admin')
  );
--> statement-breakpoint
CREATE POLICY listings_update ON public.listings FOR UPDATE TO app_user
  USING (company_id IN (SELECT app.my_company_ids()) OR app.is_staff())
  WITH CHECK (
    (company_id IN (SELECT app.my_company_ids()) AND status IN ('draft', 'pending_payment', 'expired'))
    OR app.is_staff()
  );
--> statement-breakpoint

GRANT SELECT, INSERT ON public.applications TO app_user;
--> statement-breakpoint
GRANT UPDATE (status, updated_at) ON public.applications TO app_user;
--> statement-breakpoint
CREATE POLICY applications_candidate ON public.applications FOR SELECT TO app_user
  USING (profile_id IN (SELECT app.my_profile_ids()));
--> statement-breakpoint
CREATE POLICY applications_candidate_insert ON public.applications FOR INSERT TO app_user
  WITH CHECK (
    profile_id IN (SELECT app.my_profile_ids())
    AND consent_id IN (
      SELECT c.id FROM public.consents c
      WHERE c.subject_user_id = app.uid() AND c.kind = 'apply' AND c.withdrawn_at IS NULL)
  );
--> statement-breakpoint
CREATE POLICY applications_candidate_withdraw ON public.applications FOR UPDATE TO app_user
  USING (profile_id IN (SELECT app.my_profile_ids()))
  WITH CHECK (profile_id IN (SELECT app.my_profile_ids()) AND status = 'withdrawn');
--> statement-breakpoint
CREATE POLICY applications_employer ON public.applications FOR SELECT TO app_user
  USING (listing_id IN (SELECT l.id FROM public.listings l WHERE l.company_id IN (SELECT app.my_company_ids())));
--> statement-breakpoint
CREATE POLICY applications_employer_update ON public.applications FOR UPDATE TO app_user
  USING (listing_id IN (SELECT l.id FROM public.listings l WHERE l.company_id IN (SELECT app.my_company_ids())))
  WITH CHECK (
    listing_id IN (SELECT l.id FROM public.listings l WHERE l.company_id IN (SELECT app.my_company_ids()))
    AND status IN ('viewed', 'declined', 'advanced'));
--> statement-breakpoint
CREATE POLICY applications_staff ON public.applications FOR SELECT TO app_user
  USING (app.is_talent());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.searches TO app_user;
--> statement-breakpoint
CREATE POLICY searches_employer ON public.searches FOR SELECT TO app_user
  USING (mandate_id IN (SELECT m.id FROM public.mandates m WHERE m.company_id IN (SELECT app.my_company_ids())));
--> statement-breakpoint
CREATE POLICY searches_talent ON public.searches FOR ALL TO app_user
  USING (app.is_talent()) WITH CHECK (app.is_talent());
--> statement-breakpoint

-- ------------------------------------------------------------------ matching

GRANT SELECT ON public.matches TO app_user;
--> statement-breakpoint
GRANT UPDATE (status, reviewed_by, reviewed_at, rationale, updated_at) ON public.matches TO app_user;
--> statement-breakpoint
CREATE POLICY matches_talent ON public.matches FOR SELECT TO app_user
  USING (app.is_talent());
--> statement-breakpoint
CREATE POLICY matches_talent_review ON public.matches FOR UPDATE TO app_user
  USING (app.is_talent())
  WITH CHECK (app.is_talent() AND status IN ('approved', 'rejected', 'proposed') AND reviewed_by = app.uid());
--> statement-breakpoint
-- Candidates see their own matches once a human has approved them.
CREATE POLICY matches_candidate ON public.matches FOR SELECT TO app_user
  USING (profile_id IN (SELECT app.my_profile_ids()) AND status IN ('approved', 'revealed'));
--> statement-breakpoint

GRANT SELECT, INSERT ON public.reveal_requests TO app_user;
--> statement-breakpoint
GRANT UPDATE (candidate_decision, decided_at, consent_id, updated_at) ON public.reveal_requests TO app_user;
--> statement-breakpoint

-- ------------------------------------------------------------------ employer-facing views
-- Owned by the migrating role (BYPASSRLS) so they read the base tables, then filter in WHERE.
-- security_barrier stops user-supplied predicates being evaluated before the filter.

CREATE VIEW public.employer_match_view WITH (security_barrier = true) AS
SELECT
  m.id AS match_id,
  m.mandate_id,
  md.company_id,
  md.title AS mandate_title,
  m.status,
  m.score_low,
  m.score_high,
  m.rationale,
  m.reviewed_at,
  p.level,
  p.years_experience,
  (rv.match_id IS NOT NULL) AS identity_revealed,
  CASE WHEN rv.match_id IS NOT NULL THEN p.id END AS profile_id,
  CASE WHEN rv.match_id IS NOT NULL THEN p.headline END AS headline,
  CASE WHEN rv.match_id IS NOT NULL THEN u.display_name END AS candidate_name,
  CASE WHEN rv.match_id IS NOT NULL THEN u.email END AS candidate_email
FROM public.matches m
JOIN public.mandates md ON md.id = m.mandate_id
JOIN public.candidate_profiles p ON p.id = m.profile_id
JOIN public.users u ON u.id = p.user_id
-- Identity shows only while a revealed match has an accepted, unwithdrawn reveal consent.
LEFT JOIN LATERAL (
  SELECT rr.match_id FROM public.reveal_requests rr
  JOIN public.consents c ON c.id = rr.consent_id
  WHERE rr.match_id = m.id AND m.status = 'revealed'
    AND rr.candidate_decision = 'accepted' AND c.kind = 'reveal' AND c.withdrawn_at IS NULL
  LIMIT 1
) rv ON true
WHERE m.status IN ('approved', 'revealed')
  AND p.deleted_at IS NULL
  AND p.visibility <> 'hidden'
  AND u.deleted_at IS NULL
  AND app.has_role('employer')
  AND EXISTS (
    SELECT 1 FROM public.employer_members em
    WHERE em.user_id = app.uid() AND em.company_id = md.company_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_blocklist b
    WHERE b.profile_id = p.id AND b.company_id = md.company_id);
--> statement-breakpoint
GRANT SELECT ON public.employer_match_view TO app_user;
--> statement-breakpoint

CREATE VIEW public.public_bylines WITH (security_barrier = true) AS
SELECT u.id, u.display_name
FROM public.users u
WHERE u.deleted_at IS NULL AND EXISTS (
  SELECT 1 FROM public.articles a
  WHERE a.status = 'published' AND a.deleted_at IS NULL AND (a.author_id = u.id OR a.editor_id = u.id));
--> statement-breakpoint
GRANT SELECT ON public.public_bylines TO app_user;
--> statement-breakpoint

-- Reveal requests: employer asks (only for an approved match it can see), candidate decides.
CREATE POLICY reveal_requests_employer ON public.reveal_requests FOR SELECT TO app_user
  USING (match_id IN (SELECT v.match_id FROM public.employer_match_view v));
--> statement-breakpoint
CREATE POLICY reveal_requests_employer_insert ON public.reveal_requests FOR INSERT TO app_user
  WITH CHECK (
    requested_by = app.uid()
    AND candidate_decision = 'pending'
    AND match_id IN (SELECT v.match_id FROM public.employer_match_view v WHERE v.status = 'approved')
  );
--> statement-breakpoint
CREATE POLICY reveal_requests_candidate ON public.reveal_requests FOR SELECT TO app_user
  USING (match_id IN (SELECT m.id FROM public.matches m WHERE m.profile_id IN (SELECT app.my_profile_ids())));
--> statement-breakpoint
CREATE POLICY reveal_requests_candidate_decide ON public.reveal_requests FOR UPDATE TO app_user
  USING (match_id IN (SELECT m.id FROM public.matches m WHERE m.profile_id IN (SELECT app.my_profile_ids())))
  WITH CHECK (
    match_id IN (SELECT m.id FROM public.matches m WHERE m.profile_id IN (SELECT app.my_profile_ids()))
    AND (candidate_decision = 'declined'
    OR (candidate_decision = 'accepted' AND consent_id IN (
      SELECT c.id FROM public.consents c
      WHERE c.subject_user_id = app.uid() AND c.kind = 'reveal' AND c.withdrawn_at IS NULL)))
  );
--> statement-breakpoint
CREATE POLICY reveal_requests_talent ON public.reveal_requests FOR SELECT TO app_user
  USING (app.is_talent());
--> statement-breakpoint

GRANT SELECT, INSERT ON public.messages TO app_user;
--> statement-breakpoint
CREATE POLICY messages_participants ON public.messages FOR SELECT TO app_user
  USING (
    match_id IN (SELECT m.id FROM public.matches m
                 WHERE m.status = 'revealed' AND m.profile_id IN (SELECT app.my_profile_ids()))
    OR match_id IN (SELECT v.match_id FROM public.employer_match_view v WHERE v.identity_revealed)
  );
--> statement-breakpoint
CREATE POLICY messages_send ON public.messages FOR INSERT TO app_user
  WITH CHECK (
    sender_id = app.uid() AND (
      match_id IN (SELECT m.id FROM public.matches m
                   WHERE m.status = 'revealed' AND m.profile_id IN (SELECT app.my_profile_ids()))
      OR match_id IN (SELECT v.match_id FROM public.employer_match_view v WHERE v.identity_revealed))
  );
--> statement-breakpoint

-- embeddings: no grant. Written and read by background jobs only.

-- ------------------------------------------------------------------ publication

GRANT SELECT, INSERT, UPDATE ON public.moves TO app_user;
--> statement-breakpoint
CREATE POLICY moves_select ON public.moves FOR SELECT TO app_user
  USING (status = 'approved' OR app.is_editorial());
--> statement-breakpoint
CREATE POLICY moves_write ON public.moves FOR INSERT TO app_user
  WITH CHECK (app.is_editorial());
--> statement-breakpoint
CREATE POLICY moves_update ON public.moves FOR UPDATE TO app_user
  USING (app.is_editorial())
  WITH CHECK (app.is_editorial() AND (status <> 'approved' OR approved_by = app.uid()));
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.articles TO app_user;
--> statement-breakpoint
CREATE POLICY articles_select ON public.articles FOR SELECT TO app_user
  USING ((status = 'published' AND deleted_at IS NULL) OR app.is_editorial() OR author_id = app.uid());
--> statement-breakpoint
CREATE POLICY articles_insert ON public.articles FOR INSERT TO app_user
  WITH CHECK (app.is_editorial() AND status IN ('draft', 'in_review'));
--> statement-breakpoint
CREATE POLICY articles_update ON public.articles FOR UPDATE TO app_user
  USING (app.is_editorial())
  WITH CHECK (app.is_editorial() AND (status <> 'published' OR editor_id IS NOT NULL));
--> statement-breakpoint

GRANT INSERT ON public.subscribers TO app_user;
--> statement-breakpoint
GRANT SELECT, UPDATE ON public.subscribers TO app_user;
--> statement-breakpoint
CREATE POLICY subscribers_signup ON public.subscribers FOR INSERT TO app_user
  WITH CHECK (status = 'pending');
--> statement-breakpoint
CREATE POLICY subscribers_staff ON public.subscribers FOR SELECT TO app_user
  USING (app.is_editorial());
--> statement-breakpoint
CREATE POLICY subscribers_staff_update ON public.subscribers FOR UPDATE TO app_user
  USING (app.is_editorial()) WITH CHECK (app.is_editorial());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.newsletter_issues TO app_user;
--> statement-breakpoint
CREATE POLICY newsletter_issues_select ON public.newsletter_issues FOR SELECT TO app_user
  USING (status = 'sent' OR app.is_editorial());
--> statement-breakpoint
CREATE POLICY newsletter_issues_write ON public.newsletter_issues FOR ALL TO app_user
  USING (app.is_editorial()) WITH CHECK (app.is_editorial());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.sponsorships TO app_user;
--> statement-breakpoint
CREATE POLICY sponsorships_active ON public.sponsorships FOR SELECT TO app_user
  USING (current_date BETWEEN start_date AND end_date OR app.has_role('admin'));
--> statement-breakpoint
CREATE POLICY sponsorships_admin ON public.sponsorships FOR ALL TO app_user
  USING (app.has_role('admin')) WITH CHECK (app.has_role('admin'));
--> statement-breakpoint

-- ------------------------------------------------------------------ billing (writes come from Stripe webhooks as owner)

GRANT SELECT ON public.subscriptions, public.payments TO app_user;
--> statement-breakpoint
CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT TO app_user
  USING (company_id IN (SELECT app.my_company_ids()) OR user_id = app.uid() OR app.has_role('admin'));
--> statement-breakpoint
CREATE POLICY payments_select ON public.payments FOR SELECT TO app_user
  USING (company_id IN (SELECT app.my_company_ids()) OR user_id = app.uid() OR app.has_role('admin'));
--> statement-breakpoint

GRANT SELECT ON public.api_keys TO app_user;
--> statement-breakpoint
GRANT UPDATE (revoked_at, updated_at) ON public.api_keys TO app_user;
--> statement-breakpoint
CREATE POLICY api_keys_select ON public.api_keys FOR SELECT TO app_user
  USING (company_id IN (SELECT app.my_admin_company_ids()) OR app.has_role('admin'));
--> statement-breakpoint
CREATE POLICY api_keys_revoke ON public.api_keys FOR UPDATE TO app_user
  USING (company_id IN (SELECT app.my_admin_company_ids()) OR app.has_role('admin'))
  WITH CHECK (company_id IN (SELECT app.my_admin_company_ids()) OR app.has_role('admin'));
--> statement-breakpoint

-- ------------------------------------------------------------------ operations

GRANT SELECT ON public.agent_runs TO app_user;
--> statement-breakpoint
CREATE POLICY agent_runs_staff ON public.agent_runs FOR SELECT TO app_user
  USING (app.is_staff());
--> statement-breakpoint

GRANT SELECT ON public.human_queue TO app_user;
--> statement-breakpoint
GRANT UPDATE (resolved_by, resolved_at, updated_at) ON public.human_queue TO app_user;
--> statement-breakpoint
CREATE POLICY human_queue_staff ON public.human_queue FOR SELECT TO app_user
  USING (app.is_staff());
--> statement-breakpoint
CREATE POLICY human_queue_resolve ON public.human_queue FOR UPDATE TO app_user
  USING (app.is_staff()) WITH CHECK (app.is_staff() AND resolved_by = app.uid());
--> statement-breakpoint

-- audit_log: insert as yourself (or as the system with a null actor), staff read. No UPDATE/DELETE grant.
GRANT SELECT, INSERT ON public.audit_log TO app_user;
--> statement-breakpoint
CREATE POLICY audit_log_insert ON public.audit_log FOR INSERT TO app_user
  WITH CHECK (actor_id = app.uid() OR (actor_id IS NULL AND app.uid() IS NULL));
--> statement-breakpoint
CREATE POLICY audit_log_select ON public.audit_log FOR SELECT TO app_user
  USING (app.is_talent());
--> statement-breakpoint

-- ------------------------------------------------------------------ Supabase hardening
-- Supabase grants its Data API roles access to public by default. This app does not use the Data
-- API; all access goes through app_user. Revoke so a misconfigured API key can't reach anything.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
    END IF;
  END LOOP;
END $$;
