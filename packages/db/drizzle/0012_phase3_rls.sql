-- Phase 3 security: candidate responses, the reveal trigger, the candidate's view of a match
-- (no company identity), employer search requests, and fairness reports.

-- ------------------------------------------------------------------ match status guard
-- Only talent partners change a match's status, except the reveal trigger below. Candidates may
-- update their own response columns, nothing else.
CREATE OR REPLACE FUNCTION app.matches_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF app.uid() IS NULL OR current_setting('app.internal', true) = 'reveal' THEN
    RETURN NEW; -- system / owner connection, or the reveal trigger
  END IF;
  IF NOT app.is_talent() AND (
       NEW.status IS DISTINCT FROM OLD.status
    OR NEW.rationale IS DISTINCT FROM OLD.rationale
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at) THEN
    RAISE EXCEPTION 'only a talent partner can review a match' USING ERRCODE = '42501';
  END IF;
  IF app.is_talent() AND NOT (OLD.profile_id IN (SELECT app.my_profile_ids())) AND (
       NEW.candidate_response IS DISTINCT FROM OLD.candidate_response
    OR NEW.candidate_note IS DISTINCT FROM OLD.candidate_note
    OR NEW.candidate_responded_at IS DISTINCT FROM OLD.candidate_responded_at) THEN
    RAISE EXCEPTION 'only the candidate answers a match' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.matches_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER matches_guard BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION app.matches_guard();
--> statement-breakpoint

GRANT UPDATE (candidate_response, candidate_note, candidate_responded_at) ON public.matches TO app_user;
--> statement-breakpoint
CREATE POLICY matches_candidate_respond ON public.matches FOR UPDATE TO app_user
  USING (profile_id IN (SELECT app.my_profile_ids()) AND status IN ('approved', 'revealed'))
  WITH CHECK (profile_id IN (SELECT app.my_profile_ids()) AND status IN ('approved', 'revealed'));
--> statement-breakpoint

-- ------------------------------------------------------------------ reveal
-- When the candidate accepts a reveal request (with a live reveal consent, enforced by the
-- existing policy), the match becomes 'revealed'. Declining leaves it approved and anonymous.
CREATE OR REPLACE FUNCTION app.reveal_on_accept() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
BEGIN
  IF NEW.candidate_decision = 'accepted' AND OLD.candidate_decision IS DISTINCT FROM 'accepted' THEN
    PERFORM set_config('app.internal', 'reveal', true);
    UPDATE public.matches SET status = 'revealed', updated_at = now()
     WHERE id = NEW.match_id AND status = 'approved';
    PERFORM set_config('app.internal', '', true);
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.reveal_on_accept() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER reveal_on_accept AFTER UPDATE ON public.reveal_requests
  FOR EACH ROW EXECUTE FUNCTION app.reveal_on_accept();
--> statement-breakpoint

-- ------------------------------------------------------------------ candidate's view of a match
-- The candidate sees the role, scope, comp and why it fits, but never the company's name or
-- domain until they choose to reveal themselves. Blocklisted companies never appear.
CREATE VIEW public.candidate_match_view WITH (security_barrier = true) AS
SELECT
  m.id AS match_id,
  m.status,
  m.score_low,
  m.score_high,
  m.rationale,
  m.reviewed_at,
  m.candidate_response,
  m.candidate_responded_at,
  md.title AS mandate_title,
  md.level,
  md.scope,
  md.reporting_line,
  md.team_size,
  md.priorities,
  md.work_type,
  md.comp_min,
  md.comp_max,
  md.currency,
  md.comp_basis,
  md.market,
  md.remote,
  c.industry AS company_industry,
  c.stage AS company_stage,
  c.size_band AS company_size_band,
  CASE WHEN m.status = 'revealed' THEN c.name END AS company_name,
  (SELECT rr.id FROM public.reveal_requests rr
    WHERE rr.match_id = m.id AND rr.candidate_decision = 'pending'
    ORDER BY rr.created_at DESC LIMIT 1) AS pending_reveal_request_id
FROM public.matches m
JOIN public.mandates md ON md.id = m.mandate_id
JOIN public.companies c ON c.id = md.company_id
JOIN public.candidate_profiles p ON p.id = m.profile_id
WHERE m.status IN ('approved', 'revealed')
  AND p.user_id = app.uid()
  AND p.deleted_at IS NULL
  AND app.has_role('candidate')
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_blocklist b WHERE b.profile_id = p.id AND b.company_id = md.company_id);
--> statement-breakpoint
GRANT SELECT ON public.candidate_match_view TO app_user;
--> statement-breakpoint

-- ------------------------------------------------------------------ searches
-- Employers request a paid search for one of their confirmed mandates; talent partners run it.
CREATE POLICY searches_employer_request ON public.searches FOR INSERT TO app_user
  WITH CHECK (
    status = 'scoping' AND talent_partner_id IS NULL AND placed_match_id IS NULL
    AND mandate_id IN (SELECT m.id FROM public.mandates m
                       WHERE m.company_id IN (SELECT app.my_company_ids()) AND m.confirmed_at IS NOT NULL)
  );
--> statement-breakpoint

-- ------------------------------------------------------------------ fairness reports
ALTER TABLE public.fairness_reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.fairness_reports FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON public.fairness_reports TO app_user;
--> statement-breakpoint
CREATE POLICY fairness_reports_staff ON public.fairness_reports FOR SELECT TO app_user USING (app.is_staff());
