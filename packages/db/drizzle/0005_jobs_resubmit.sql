-- Jobs workstream: let an employer resubmit a rejected listing for review without paying again.
-- An employer may move its listing into pending_review only when the listing is already paid.
-- paid_at can only be set by the payment webhook (app.listings_guard), so this cannot skip payment.
DROP POLICY listings_update ON public.listings;
--> statement-breakpoint
CREATE POLICY listings_update ON public.listings FOR UPDATE TO app_user
  USING (company_id IN (SELECT app.my_company_ids()) OR app.is_staff())
  WITH CHECK (
    (company_id IN (SELECT app.my_company_ids())
      -- Compared as text: migrations run in one transaction, and 'rejected' is an enum value
      -- added earlier in that same transaction, which Postgres will not accept as a literal.
      AND (status::text IN ('draft', 'pending_payment', 'expired', 'rejected')
           OR (status::text = 'pending_review' AND paid_at IS NOT NULL)))
    OR app.is_staff()
  );
