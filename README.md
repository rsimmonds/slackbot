# CMO Beat

A publication and hiring platform for Chief Marketing Officers. It publishes CMO moves, interviews and comp data; lists senior marketing roles with comp on every listing; and uses AI to help companies define the mandate and match it to leaders. A person approves every match, and every published item, before anyone sees it.

Sample data only. Every company and person in this repo is fictional.

- Plan and phase checklist: [`PLAN.md`](PLAN.md)
- What changed, phase by phase: [`CHANGELOG.md`](CHANGELOG.md)
- Questions for counsel: [`LEGAL_REVIEW.md`](LEGAL_REVIEW.md)
- Every setting: [`.env.example`](.env.example)

## What's in it

| Area | Highlights |
| --- | --- |
| Publication | Home, stories, The Mandate interviews, CMO Moves archive with sources, data pages and charts, newsletter with double opt-in, State of the CMO Seat report, RSS, sitemap, `llms.txt` |
| Job board | Filters, comp on every card, JobPosting JSON-LD, saved searches with alerts, post a job (AI-parsed), checkout, moderation, expiry |
| Employers | Mandate Builder interview, editable mandate with comp benchmark and PDF, shortlists, introductions, paid searches, subscription, team seats, data API keys, exports, billing |
| Candidates | Private profile interview, line-by-line approval, visibility (hidden by default), blocklist, matches without company names until reveal, consent gate, messaging, concierge coaching, career digest, data export and delete |
| Staff console | Editorial queue, move review, article editor, listing moderation, match review, searches, coaching, agent monitoring, fairness reports, sponsorships, report leads |
| AI agents | Moves Tracker, Listing Parser, Mandate Builder, Profile Interviewer, Matcher. Prompts in `agents/`, evals in CI |

## Layout

```
apps/web          Next.js App Router: every page, API route and background job
packages/ui       Design system "Synthetic Calm": tokens, themes, components, Storybook
packages/db       Drizzle schema, migrations, row-level security, encryption, seed
packages/ai       Agent runtime, interview engine, matching, embeddings, evals
packages/payments Stripe and test adapters: checkout, invoices, subscriptions
packages/email    Resend and outbox adapters, React Email templates, newsletter provider
packages/config   Brand, markets, roles, prices, plans, env schema
agents/           Agent prompts and eval cases
```

## Run it locally

Needs Node 22, pnpm 10, and Postgres 16 with pgvector.

```bash
cp .env.example .env            # fill DEV_AUTH_SECRET and ENCRYPTION_MASTER_KEY
pnpm install
pnpm db:reset                   # migrate + seed sample data
pnpm dev                        # http://localhost:3000
```

Sign in at `/sign-in` as any sample user (one per role). This dev sign-in exists until Clerk is connected, and refuses to run on a production deployment.

Without keys, everything runs on offline stand-ins: AI agents use deterministic fixtures, payments use a clearly labelled test checkout, emails go to an outbox table, uploads are encrypted in Postgres, and embeddings use a local model.

## Checks

```bash
pnpm lint && pnpm typecheck
pnpm contrast                   # WCAG 2.2 AA on every colour pair, both themes
pnpm test                       # unit, integration (incl. row-level security) and offline evals
pnpm --filter @cmobeat/ai evals # eval scores per agent
pnpm build && pnpm test:e2e     # Playwright, desktop + mobile, with axe; uses its own <db>_e2e database
pnpm storybook                  # http://localhost:6006
```

## Rules the code enforces

1. **Confidentiality.** Candidate data is private by default and enforced in Postgres, not only in the app. Employers can't query candidate tables; they see a filtered view of approved matches with identity hidden until the candidate consents. Hidden profiles are invisible to every other role, staff included.
2. **Human judgement.** AI drafts and proposes. A person approves every match, move and article. Only talent partners can change a match's status (database trigger).
3. **Editorial integrity.** Nothing publishes without an editor.
4. **Blind matching.** The Matcher never sees names, contact details, employers, years of experience or protected attributes. A weekly fairness report checks invariance and the four-fifths rule.

## Going live: accounts to connect

| Service | Used for | Settings |
| --- | --- | --- |
| Clerk | Sign-in (magic links, Google, Microsoft, MFA for staff) | `AUTH_MODE=clerk`, Clerk keys |
| Supabase | Postgres + pgvector, file storage, key management | `DATABASE_URL`, `APP_DATABASE_URL`, `STORAGE_PROVIDER=supabase` |
| Vercel | Hosting, preview and production deploys | Project env vars from `.env.example` |
| Anthropic | All five agents; live evals | `ANTHROPIC_API_KEY` |
| Voyage AI | Embeddings for matching | `VOYAGE_API_KEY` |
| Stripe | Job posts, subscriptions, search invoices | Stripe keys, price IDs, webhook events listed in `.env.example` |
| Resend | Email and newsletter broadcasts | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `COMPANY_POSTAL_ADDRESS` |
| Inngest | Scheduled and event-driven jobs | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` |
| Sentry, PostHog | Errors, analytics (behind cookie consent) | `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY` |

Before launch, resolve the open items in `LEGAL_REVIEW.md`, especially the email postal address, news-feed terms, the EU AI Act and data-residency questions, and the draft legal pages.
