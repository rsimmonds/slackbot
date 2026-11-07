-- Editors and admins see the names of colleagues who write or edit, so the editorial queue can
-- show real bylines. Everyone else sees no rows. Exposes display names only.
CREATE VIEW public.staff_bylines WITH (security_barrier = true) AS
SELECT u.id, u.display_name
FROM public.users u
WHERE u.deleted_at IS NULL
  AND app.is_staff()
  AND (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role::text IN ('editor', 'talent_partner', 'admin'))
    OR EXISTS (SELECT 1 FROM public.articles a WHERE a.deleted_at IS NULL AND (a.author_id = u.id OR a.editor_id = u.id))
  );
--> statement-breakpoint
GRANT SELECT ON public.staff_bylines TO app_user;
