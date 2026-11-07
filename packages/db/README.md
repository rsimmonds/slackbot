# @cmobeat/db

Postgres schema, migrations, row-level security, field encryption and sample seed.

## Env

| Var | Use |
| --- | --- |
| `DATABASE_URL` | Owner role. Migrations, seed, jobs, webhooks. Must have BYPASSRLS (superuser locally, `postgres` on Supabase). |
| `APP_DATABASE_URL` | Login role for the web app (`cmobeat_app`), member of `app_user`. RLS applies. `db:reset` creates it from this URL. |
| `ENCRYPTION_MASTER_KEY` | 32-byte base64 key for `LocalKeyProvider`. Dev/test only; use a KMS-backed `KeyProvider` in production. |

## Commands

```
pnpm db:reset      # drop, migrate, seed (dev/test only)
pnpm db:migrate
pnpm db:seed       # empty database only
pnpm db:generate   # new migration after editing src/schema.ts
pnpm --filter @cmobeat/db test   # needs a local cmobeat_test database
```

## Access model

- Every user request runs through `withUser({ userId, roles }, tx => …)` or `withAnon(tx => …)`. They set `app.user_id` and `app.roles` for the transaction.
- A claimed role counts only if it is also in `user_roles`.
- RLS is enabled and forced on every table. Policies live in `drizzle/0002_rls.sql`.
- **Hidden profiles are visible to their owner only.** Talent partners see anonymous and open profiles.
- **Employers never read candidate tables.** They read `employer_match_view`: approved matches for their company, minus blocklisted candidates, with identity columns null until a reveal is accepted under a live consent.
- `audit_log` is append-only, enforced by trigger for every role, including the owner.
- `adminDb()` bypasses RLS. Never use it to serve a request.
