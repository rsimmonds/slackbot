# CMO Beat

A publication and hiring platform for Chief Marketing Officers. It publishes CMO moves, interviews and comp data; lists senior marketing roles with comp on every listing; and uses AI to help companies define the mandate and match it to leaders, with a human approving every match.

Sample data only. Every company and person in this repo is fictional.

- Plan: [`PLAN.md`](PLAN.md)
- Changes: [`CHANGELOG.md`](CHANGELOG.md)
- Legal questions: [`LEGAL_REVIEW.md`](LEGAL_REVIEW.md)
- Environment: [`.env.example`](.env.example)

## Layout

```
apps/web          Next.js App Router (public site, candidate, employer, staff console)
packages/ui       Design system "Synthetic Calm": tokens, themes, components, Storybook
packages/db       Drizzle schema, migrations, row-level security, encryption, seed
packages/config   Brand, markets, roles, prices, env schema
agents/           Agent prompts and evals (from Phase 1)
```

## Run it locally

Needs Node 22, pnpm 10, and Postgres 16 with pgvector.

```bash
cp .env.example .env            # fill DEV_AUTH_SECRET and ENCRYPTION_MASTER_KEY
pnpm install
pnpm db:reset                   # migrate + seed sample data
pnpm dev                        # http://localhost:3000
```

Sign in at `/sign-in` as any sample user (one per role). This dev sign-in exists until Clerk is connected; it refuses to run in production.

## Checks

```bash
pnpm lint && pnpm typecheck
pnpm contrast                   # WCAG 2.2 AA on every token pair, both themes
pnpm test                       # unit + database integration (RLS) tests
pnpm build && pnpm test:e2e     # Playwright, desktop + mobile, with axe
pnpm storybook                  # http://localhost:6006
```

## Three rules the code enforces

1. **Confidentiality.** Candidate data is private by default. Postgres row-level security means employers cannot query candidate tables at all; they see a filtered view of approved matches, with identity hidden until the candidate consents.
2. **Human judgement.** AI drafts and proposes. A person approves every match, move and article before anyone sees it.
3. **Editorial integrity.** Nothing publishes without an editor.

## Connecting real services

| Service | Status | To connect |
| --- | --- | --- |
| Clerk | Not connected | Set `AUTH_MODE=clerk` and both Clerk keys. Enable magic links, Google, Microsoft; require MFA for staff. |
| Supabase | Not connected | Point `DATABASE_URL` / `APP_DATABASE_URL` at Supabase; run `pnpm db:migrate`. |
| Vercel | Not connected | Import the repo; set env vars from `.env.example` per environment. |
