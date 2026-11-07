-- Subscriptions workstream: unlimited job posts for subscribers.
-- An employer may move a listing into pending_review either when it is paid (one-off posts) or,
-- for plan 'subscription', when the company holds an active employer subscription. Subscription
-- rows are written only by the payment webhook (owner connection), so this cannot be forged.
-- past_due keeps access during the provider's payment-retry window.
DROP POLICY listings_update ON public.listings;
--> statement-breakpoint
CREATE POLICY listings_update ON public.listings FOR UPDATE TO app_user
  USING (company_id IN (SELECT app.my_company_ids()) OR app.is_staff())
  WITH CHECK (
    (company_id IN (SELECT app.my_company_ids())
      AND (status::text IN ('draft', 'pending_payment', 'expired', 'rejected')
           OR (status::text = 'pending_review' AND paid_at IS NOT NULL)
           OR (status::text = 'pending_review' AND plan::text = 'subscription' AND EXISTS (
                 SELECT 1 FROM public.subscriptions s
                 WHERE s.company_id = listings.company_id
                   AND s.product = 'employer_subscription'
                   AND s.status IN ('active', 'trialing', 'past_due')
                   AND (s.current_period_end IS NULL OR s.current_period_end > now())))))
    OR app.is_staff()
  );
--> statement-breakpoint

-- Team and seats: members of a company see who else holds a seat (name, email, seat role only).
CREATE VIEW public.company_team_view WITH (security_barrier = true) AS
SELECT
  em.id AS member_id,
  em.company_id,
  em.user_id,
  em.seat_role,
  em.created_at AS joined_at,
  u.display_name,
  u.email
FROM public.employer_members em
JOIN public.users u ON u.id = em.user_id
WHERE u.deleted_at IS NULL
  AND em.company_id IN (SELECT app.my_company_ids());
--> statement-breakpoint
GRANT SELECT ON public.company_team_view TO app_user;
--> statement-breakpoint

-- Company admins may remove members of their own company (they must be able to see the row).
CREATE POLICY employer_members_admin_select ON public.employer_members FOR SELECT TO app_user
  USING (company_id IN (SELECT app.my_admin_company_ids()));
--> statement-breakpoint
GRANT DELETE ON public.employer_members TO app_user;
--> statement-breakpoint
CREATE POLICY employer_members_remove ON public.employer_members FOR DELETE TO app_user
  USING (company_id IN (SELECT app.my_admin_company_ids()));
--> statement-breakpoint

-- A company always keeps at least one owner.
CREATE OR REPLACE FUNCTION app.employer_members_keep_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.seat_role = 'owner' AND NOT EXISTS (
       SELECT 1 FROM public.employer_members em
       WHERE em.company_id = OLD.company_id AND em.seat_role = 'owner' AND em.id <> OLD.id) THEN
    RAISE EXCEPTION 'a company must keep at least one owner' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.employer_members_keep_owner() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER employer_members_keep_owner BEFORE DELETE ON public.employer_members
  FOR EACH ROW EXECUTE FUNCTION app.employer_members_keep_owner();
