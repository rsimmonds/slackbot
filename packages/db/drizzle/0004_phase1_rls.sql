-- Phase 1 security: new tables, listing payment/moderation guard, newsletter token functions.

-- ------------------------------------------------------------------ email_outbox (system writes; staff read)
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.email_outbox FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON public.email_outbox TO app_user;
--> statement-breakpoint
CREATE POLICY email_outbox_staff ON public.email_outbox FOR SELECT TO app_user USING (app.has_role('admin'));
--> statement-breakpoint

-- ------------------------------------------------------------------ source_items (jobs write; editors read; users submit)
ALTER TABLE public.source_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.source_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.source_items TO app_user;
--> statement-breakpoint
GRANT UPDATE (status, move_id, updated_at) ON public.source_items TO app_user;
--> statement-breakpoint
CREATE POLICY source_items_editorial ON public.source_items FOR SELECT TO app_user USING (app.is_editorial());
--> statement-breakpoint
CREATE POLICY source_items_submit ON public.source_items FOR INSERT TO app_user
  WITH CHECK (app.uid() IS NOT NULL AND kind = 'submission' AND submitted_by = app.uid() AND status = 'new');
--> statement-breakpoint
CREATE POLICY source_items_update ON public.source_items FOR UPDATE TO app_user
  USING (app.is_editorial()) WITH CHECK (app.is_editorial());
--> statement-breakpoint

-- ------------------------------------------------------------------ listings: payment and moderation fields
-- paid_at is set only by the payment webhook (owner connection, no app.user_id).
-- moderated_* is set only by staff. Employers cannot forge either.
CREATE OR REPLACE FUNCTION app.listings_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF app.uid() IS NULL THEN
    RETURN NEW; -- system / owner connection
  END IF;
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'paid_at is set by the payment webhook only' USING ERRCODE = '42501';
  END IF;
  IF NOT app.is_staff() AND (
       NEW.moderated_by IS DISTINCT FROM OLD.moderated_by
    OR NEW.moderated_at IS DISTINCT FROM OLD.moderated_at
    OR NEW.moderation_note IS DISTINCT FROM OLD.moderation_note) THEN
    RAISE EXCEPTION 'moderation fields are staff-only' USING ERRCODE = '42501';
  END IF;
  IF app.is_staff() AND NEW.moderated_by IS DISTINCT FROM OLD.moderated_by AND NEW.moderated_by <> app.uid() THEN
    RAISE EXCEPTION 'moderate in your own name' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'live' AND OLD.status <> 'live' AND NEW.paid_at IS NULL AND NEW.plan <> 'subscription' THEN
    RAISE EXCEPTION 'a listing must be paid before it goes live' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.listings_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER listings_guard BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION app.listings_guard();
--> statement-breakpoint

-- ------------------------------------------------------------------ newsletter (double opt-in by token)
-- Anonymous visitors cannot read subscribers. These SECURITY DEFINER functions expose exactly the
-- token-based operations the public flows need, and nothing else.

CREATE OR REPLACE FUNCTION app.new_token() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;
--> statement-breakpoint

-- Returns a confirm token to email, or NULL when the address is already active (the caller shows
-- the same message either way, so signup never reveals who is subscribed).
CREATE OR REPLACE FUNCTION app.newsletter_signup(
  p_email text, p_source text, p_market public.market, p_consent_text text, p_segments text[]
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_token text := app.new_token();
  v_status public.subscriber_status;
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
  END IF;
  SELECT status INTO v_status FROM public.subscribers WHERE email = v_email;
  IF v_status = 'active' THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.subscribers (email, segments, source, status, confirm_token, confirm_token_expires_at,
                                  manage_token, market, consent_at, consent_text)
  VALUES (v_email, coalesce(p_segments, '{}'), p_source, 'pending', v_token, now() + interval '48 hours',
          app.new_token(), p_market, now(), p_consent_text)
  ON CONFLICT (email) DO UPDATE SET
    status = 'pending', confirm_token = v_token, confirm_token_expires_at = now() + interval '48 hours',
    segments = coalesce(p_segments, public.subscribers.segments), source = p_source,
    market = coalesce(p_market, public.subscribers.market), consent_at = now(), consent_text = p_consent_text,
    unsubscribed_at = NULL, updated_at = now();
  RETURN v_token;
END $$;
--> statement-breakpoint

-- Activates a pending subscriber. Returns the manage token (for the welcome email), or NULL.
CREATE OR REPLACE FUNCTION app.newsletter_confirm(p_token text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
DECLARE v_manage text;
BEGIN
  UPDATE public.subscribers
     SET status = 'active', confirmed_at = now(), confirm_token = NULL, confirm_token_expires_at = NULL,
         updated_at = now()
   WHERE confirm_token = p_token AND status = 'pending' AND confirm_token_expires_at > now()
  RETURNING manage_token INTO v_manage;
  RETURN v_manage;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.newsletter_get(p_manage_token text)
RETURNS TABLE (email text, status public.subscriber_status, segments text[], preferences jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT s.email, s.status, s.segments, s.preferences FROM public.subscribers s
  WHERE s.manage_token = p_manage_token AND p_manage_token IS NOT NULL AND length(p_manage_token) >= 32
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.newsletter_update(p_manage_token text, p_preferences jsonb, p_segments text[])
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
BEGIN
  IF p_preferences->>'frequency' NOT IN ('weekly', 'monthly') OR jsonb_typeof(p_preferences->'topics') <> 'array' THEN
    RAISE EXCEPTION 'invalid preferences' USING ERRCODE = '22023';
  END IF;
  UPDATE public.subscribers SET preferences = p_preferences, segments = coalesce(p_segments, segments), updated_at = now()
   WHERE manage_token = p_manage_token AND length(p_manage_token) >= 32;
  RETURN FOUND;
END $$;
--> statement-breakpoint

-- One-click unsubscribe (RFC 8058). Idempotent.
CREATE OR REPLACE FUNCTION app.newsletter_unsubscribe(p_manage_token text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
BEGIN
  UPDATE public.subscribers SET status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now()),
         updated_at = now()
   WHERE manage_token = p_manage_token AND length(p_manage_token) >= 32;
  RETURN FOUND;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.newsletter_signup(text, text, public.market, text, text[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.newsletter_confirm(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.newsletter_get(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.newsletter_update(text, jsonb, text[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.newsletter_unsubscribe(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.newsletter_signup(text, text, public.market, text, text[]) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.newsletter_confirm(text) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.newsletter_get(text) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.newsletter_update(text, jsonb, text[]) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.newsletter_unsubscribe(text) TO app_user;
