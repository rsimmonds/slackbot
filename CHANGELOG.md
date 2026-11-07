# Changelog

## Phase 1: Publication and job board (2026-11-07)

### Built
- **Publication** (Lab theme, server-rendered):
  - Home: lead story, live Moves Feed, newsletter signup, featured roles, data cards.
  - Stories and reports (`/articles`) and The Mandate interviews (`/interviews`): reading progress, pull quotes, takeaways, chapters, and a media player that loads nothing until play is pressed.
  - CMO Moves archive with filters and full-text search; each move page lists its sources.
  - Data page: moves by industry, and comp ranges charted one currency at a time, each with a table view.
  - Newsletter: double opt-in, preferences, one-click unsubscribe, archive.
  - SEO and AI visibility: sitemap, robots, `llms.txt`, RSS, canonical URLs, Article / Person / JobPosting JSON-LD.
  - Accessible mobile menu.
- **Job board:**
  - `/jobs` with filters (level, function scope, stage, industry, market, remote, work type, minimum comp within one currency, keywords). Comp shows on every card.
  - Job pages with structured mandates and JobPosting JSON-LD.
  - Saved searches with daily or weekly email alerts.
- **Post a job:** paste a job description → AI-structured mandate → employer edits and confirms (comp required) → plan → checkout → staff review → live for 60 days. Expiry and 7-day renewal reminders.
- **Payments** (`@cmobeat/payments`):
  - Stripe Checkout adapter, plus a signed local test checkout used until Stripe keys exist.
  - The webhook is idempotent and is the only code allowed to mark a listing paid (enforced in Postgres).
- **Editorial console:**
  - Queue of AI-drafted moves and articles.
  - Move review side by side with sources.
  - Article editor with a live preview rendered by the same code as the public page.
  - Approve, reject and publish, with a field-level audit trail. Publishing your own draft needs an explicit confirmation.
  - Editors now see colleagues' bylines.
- **AI agents** (`@cmobeat/ai`):
  - Runtime: structured outputs validated with Zod, retry once then human queue, prompt caching, refusal fallback, and every call logged with tokens and cost.
  - **Listing Parser** (Claude Haiku 5.5): reads text or a URL. The URL fetch can't reach internal addresses (SSRF-safe).
  - **Moves Tracker** (Haiku to classify, Sonnet 5.5 to draft): newsroom and press-wire feeds, SEC EDGAR 8-K Item 5.02 filings, and reader tips. Sources or silence; drafts only ever land in the editorial queue. Runs every 2 hours.
  - Reader tips at `/moves/submit`.
- **Evals:** 22 cases each for the Listing Parser, Moves Tracker classify and Moves Tracker draft. They run offline in CI; `EVALS_LIVE=1` scores the real model and records outputs.
- **Email** (`@cmobeat/email`): Resend adapter, React Email templates with a compliant footer, `List-Unsubscribe` headers, and a `NewsletterProvider` with an outbox adapter and a Resend Broadcasts adapter. Every email is recorded in an outbox table.
- **Database:**
  - Migrations 0003–0006: subscriber tokens and preferences, payment and moderation fields, the email outbox and Moves Tracker source tables.
  - A guard so employers can't mark themselves paid or approve themselves.
  - Token-only newsletter functions, so anonymous visitors never read the subscriber table.
  - Resubmission after rejection without paying twice.
  - An editor-only byline view.

### Results
- 226 unit, integration and eval tests; 66 Playwright tests on desktop and mobile, with zero axe violations.
- Lighthouse on public pages (home, jobs, job, article, moves, data, newsletter): performance 94–98, accessibility 98–100, best practices 96, SEO 100.

### Stubbed until accounts exist
- **Claude API:** agents run on deterministic offline fixtures. Drafting quality and live eval scores can't be measured until a key is connected.
- **Stripe:** test checkout only. Live checkout needs keys and price IDs.
- **Resend:** emails are recorded in the outbox, not sent. The live send and Broadcasts code is untested against the real API.
- **Inngest:** jobs are registered but not deployed. The job functions can also be run directly.
- **Moves Tracker sources:** none configured. Feeds, and the EDGAR User-Agent, wait for legal review (items E4 and E5).

### Deviations
- Structured outputs use the API's `output_config.format` rather than forced tool calls. The 5.5 models reject forced tool calls, and structured outputs give the same schema guarantee.
- Median CMO tenure is a clearly labelled illustrative sample: the seed has no matched appointment and departure pairs to measure it from.
- The signup rate limiter is per server instance; it needs a shared store before launch.
- Confidential apply is shown but disabled until private profiles arrive in Phase 2.
- Published articles and moves can't be edited yet. Corrections come in a later phase.

### Open questions
- Can you connect an Anthropic API key so the agents can be scored live?
- Stripe, Resend and Inngest accounts are needed before launch.
- `LEGAL_REVIEW.md` now holds 29 open items. The newest cover feed terms, SEC fair access, reader-tip retention, the email postal address, and Anthropic as a subprocessor.

## Phase 0: Foundations (2026-11-07)

### Built
- **Monorepo.** pnpm workspaces + Turborepo, TypeScript strict, ESLint, Prettier. CI on every pull request: format, lint, typecheck, contrast, unit + database tests, migrate + seed, build, Storybook build, Playwright, secret scan and dependency audit.
- **Brand.** CMO Beat, in one config file (`packages/config/src/brand.ts`).
- **Markets.** US, Canada, EU and UK. USD, CAD, EUR, GBP. A `data_region` on users and profiles for future EU hosting.
- **Design system "Synthetic Calm"** (`packages/ui`):
  - Tokens for both themes: Retreat (dark, private areas) and Lab (light, public).
  - Type scale, motion tokens, mesh glass, volumetric light and film grain.
  - Reduced-motion and reduced-transparency fallbacks.
  - The eight signature components, each with Storybook stories: Iris, Mesh Panel, Session View, Moves Feed, Match Dossier, Consent Gate, Command Palette, Data Card.
  - Supporting components: Button, Field, Status, Signal Line, Resolve, Human Seal, Theme Toggle.
- **Contrast check.** `pnpm contrast` checks all 72 text and interactive colour pairs against WCAG 2.2 AA in both themes, and runs in CI.
- **Database** (`packages/db`):
  - Drizzle schema for every table in the plan, with pgvector.
  - Migrations, and row-level security forced on all user data.
  - An employer view that shows only approved matches, with identity hidden until consent and blocklisted companies excluded.
  - An append-only audit log.
  - Envelope field encryption (AES-256-GCM).
  - 44 integration tests that prove the privacy rules against real Postgres.
- **Seed.** All rows are fictional and flagged `is_sample`:
  - 40 companies across US, CA, EU and UK
  - 60 CMO profiles with 238 outcomes
  - 30 listings
  - 12 articles
  - 28 moves
  - 6 dev users, one per role
- **App** (`apps/web`):
  - Next.js 16 with sign-in and six role-specific dashboards. Each one is empty but fully styled, in both themes.
  - Three walls of access control: the proxy, a check in each layout, and Postgres RLS.
  - Staff sessions capped at 12 hours.
  - Security headers baseline (CSP, HSTS, frame-ancestors none and others).
  - Cmd+K command palette.
- **Tests.**
  - Playwright on desktop and mobile: each role lands on its dashboard in both themes with zero axe violations, wrong roles are bounced, and security headers are present.
  - Unit tests for session signing and area access.

### Stubbed
- **Clerk.** The adapter is written but not connected. Until keys exist, a local dev sign-in lets you choose a sample user. It refuses to run on a Vercel production deployment, and in any production build unless explicitly allowed for tests.
- **Deploys.** Vercel preview and production deploys aren't configured because there's no account yet. Env vars are documented in `.env.example`.
- **Encryption keys.** The master key comes from env. A KMS / Supabase Vault provider plugs into the same `KeyProvider` interface.

### Deviations from the spec
- Some colours in the spec fail WCAG AA as text:
  - `--text-3`: 3.3:1 in dark, 2.9:1 in light
  - light `--synapse`: 3.75:1
  - light `--filament`: 3.77:1
  - light `--signal-good`: 3.99:1
- Fixes:
  - `--text-3` was nudged to pass (#80858B dark, #6B6F74 light).
  - The spec colours stay for graphics, which only need 3:1.
  - New `*-ink` tokens (e.g. `--synapse-ink` #0A75AF in light) are used for text.
- `listings.company_id` was added and is filled by a trigger. This keeps the security policies simple and stops employers attaching listings to another company's mandate.

### Open questions
- Should the new repository be created now? The code moves over with full history.
- Who will register cmobeat.com?
- Is the account set-up order for Phase 1 right: Clerk, Supabase, Vercel, then Anthropic, Stripe and Resend?
- `LEGAL_REVIEW.md` lists 20 questions for counsel. The EU AI Act and EU data residency items matter most now that Europe is in scope.
