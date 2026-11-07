-- Employers no longer see a candidate's years of experience before (or after) a reveal: it can act
-- as an age proxy, and the Matcher does not use it either. The column stays (always null) so the
-- reveal and messaging policies that depend on this view are untouched.
CREATE OR REPLACE VIEW public.employer_match_view WITH (security_barrier = true) AS
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
  -- Withheld: years of experience can act as an age proxy. Employers see level only.
  NULL::integer AS years_experience,
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
