# Changelog

## Phase 4: Scale (2026-11-07)

### Built
- **Employer subscription** ($1,500/mo): unlimited job posts (plan `subscription`; the database refuses it without an active subscription), 5 seats included, Billing Portal (test portal offline), cancel at period end.
- **Team and seats** (`/employer/team`):
  - Invitations are emailed once, stored hashed, and expire in 14 days.
  - Accepted only by the invited email, through one database function.
  - Members can be removed; the last owner can't (trigger).
- **Candidate concierge** ($99/mo): human coaching requests with encrypted topics; talent partners take, schedule and complete them at `/console/coaching`.
- **Career digest**: weekly email of matching roles and relevant moves, for candidates who opt in.
- **Data API** (`/api/v1`, read-only):
  - Endpoints: moves, listings, comp aggregates (cells under 5 suppressed) and companies.
  - Keys are shown once, stored hashed with a pepper, scoped and revocable.
  - Rate limits of 60/min and 10,000/day, with usage per day.
  - OpenAPI 3.1 spec and `/developers` docs.
  - Data is served as an anonymous visitor would see it, so private tables are unreachable by design, and tests prove it.
- **Intelligence exports** (`/employer/data`): moves and comp as CSV or JSON, streamed, with a provenance line. Spreadsheet formula injection is neutralised.
- **State of the CMO Seat report**: a PDF generated from data, including a method and limitations page.
- **Report gate** (`/data/report`): the newsletter opt-in is unticked by default. Leads are recorded separately from subscribers; ticking the box starts the usual double opt-in. Signed, short-lived download links. Editors see leads and export them at `/console/leads`.
- **Public data pages** by industry and market: "Cite this" blocks, `Dataset` JSON-LD, public CSVs, in the sitemap.

### Fixed during integration
- **Migrations:** two branches both added a migration 0016. The second is now 0017, and the snapshot chain is repaired; drizzle-kit reports no drift.
- **Mandate PDF:** the footer and page numbers were silently dropped. They render now, and a test checks it.
- **Staff header:** it used the menu button below 1280px once the console reached nine links.
- **Test isolation:** billing browser tests ran in parallel against the same employer subscription. They now run in sequence and clean up after themselves.

### Results
- 400 unit, integration and eval tests; 141 Playwright tests on desktop and mobile, passing twice in a row.
- Lighthouse on nine public pages: performance 94–97, accessibility 98–100, best practices 96, SEO 100.
- Phase 4 acceptance: a subscriber pulls a moves dataset through the API, and the annual report captures leads into the subscriber list.

## Status of the whole build (definition of done)
1. **Every flow passes in Playwright on desktop and mobile.** Done. Each phase's "done when" criteria have an acceptance test; flows that change shared state run once, on desktop.
2. **Lighthouse 90+ on public pages.** Done (see above).
3. **Agent eval suites pass their thresholds in CI.** Done offline: listing parser, Moves Tracker (classify and draft), Mandate Builder, Profile Interviewer and Matcher, each with 22 or more cases. Scoring against the live model needs an Anthropic key (`EVALS_LIVE=1`).
4. **README, PLAN, CHANGELOG, .env.example and LEGAL_REVIEW are complete and current.** Done.

Still requires accounts or keys: Clerk, Supabase (database and storage), Vercel, Anthropic, Voyage AI, Stripe, Resend, Inngest, Sentry and PostHog. Every one sits behind an interface with a working offline stand-in. Switching each over is configuration, not code.

## Phase 3: Matching (2026-11-07)

### Built
- **Blind matching** (`proposeMatchesForMandate`):
  - **Stage 1:** hard filters. Visible profiles only, compatible level, work type, market (remote counts), comp overlap within the same currency and pay basis, blocklist, and not already matched.
  - **Stage 2:** pgvector shortlist, then the Matcher ranks up to 25 with a fit range and reasons for and against.
  - Writes **proposals only**. Idempotent and audit-logged.
- **Blind profiles:** the Matcher never sees names, contact details, employer names, years of experience, graduation years, or any protected attribute. Each run uses opaque references.
- **Matcher agent** (Claude Opus 5.5): structured output. Unknown references are dropped. Nightly runs can use the Message Batches API. Offline mode is a deterministic ranker that counts quantified evidence only.
- **Embeddings:** Voyage AI adapter, plus a deterministic local embedder used offline. Refreshed when a mandate is confirmed or a profile becomes visible, and nightly.
- **Fairness:**
  - **Invariance:** 360 of 360 paired variants (differing only in protected attributes) produce identical blind inputs and scores.
  - **Selection rates:** the four-fifths impact-ratio check passes at a minimum of 1.00 across 2,112 variants.
  - Weekly report written to `fairness_reports`; staff page `/console/fairness`.
  - Tested against a deliberately biased scorer: it fails on raw text and passes once blinded.
- **Staff review** (`/console/matches`): run matching, then the Match Dossier (mandate against anonymized profile). Approve (amber, in your own name), edit the rationale, or reject. Full audit trail per match.
- **Employer shortlist:** approved matches only, anonymized, with the Human Review seal. Request an introduction. Identity (name, email, headline) appears only after the candidate consents.
- **Candidate matches** (`/me/matches`): the role, scope, comp, industry and stage are shown, but **no company name until reveal**. Interested, not for me, or ask a question (note encrypted). Reveal goes through the Consent Gate; consent can be withdrawn and identity hides immediately.
- **Messaging** after a consented reveal: encrypted bodies, and notification emails with no content.
- **Paid searches:**
  - The employer requests an AI-assisted search (12% of first-year cash comp) or a fractional match (15% of the monthly retainer), accepting terms that are copied onto the search.
  - Talent partners run the search: scoping → sourcing (runs matching) → shortlist → interviewing → placed.
  - A placement must be a consented, revealed match.
- **Invoicing:** Stripe Invoicing adapter, plus a test invoice provider. Invoices are idempotent, the webhook handles `invoice.paid`, and fractional placements are invoiced monthly. Employer billing page.
- **Database:**
  - Migrations 0011–0013.
  - Only talent partners can change a match's status (trigger). Candidates answer only their own matches.
  - Accepting a reveal with live consent marks the match revealed (trigger).
  - `candidate_match_view` withholds the company until reveal.
  - Employers request searches only for their own confirmed mandates.
  - Fairness reports are staff-only.
  - Employers no longer see years of experience (age proxy).

### Fixed during integration
- **Match scores:** stored 0–1 (database check) and shown ×100. The Matcher works in 0–100 and converts on insert; a round-trip test covers it.
- **Audit naming:** `match.proposed` is labelled in the dossier trail.
- **Test isolation:** tests from different workstreams no longer collide on shared rows (payment counts, one match per mandate and profile).
- **Parallel test resets:** creating the shared app database role is now race-safe.

### Results
- 356 unit, integration and eval tests; 124 Playwright tests on desktop and mobile with axe; 72/72 contrast pairs; Matcher evals 25/25.
- The Phase 3 acceptance test passes: a mandate produces a shortlist, a talent partner approves two, one candidate consents and one declines, the employer sees only the consented identity, and every step is in the audit log.
- A real-pipeline browser test runs matching and approves a proposal.

### Stubbed until accounts exist
- Voyage AI (local embedder), the Claude Matcher (offline ranker), the Message Batches path (tested with a mock), Stripe Invoicing (test invoices), and Inngest events (nightly jobs catch up).

### Known issue
- One web test failed twice under full parallel runs and couldn't be reproduced in 14 later runs. A role-creation race in parallel database resets was found and fixed and is the likely cause. Watch CI.

## Phase 2: AI layer (2026-11-07)

### Built
- **Interview engine** (`@cmobeat/ai/interview`): one question at a time, a follow-up on vague answers (at most one per field), stops at 15 questions or when complete, and saves and resumes.
  - Session state is always encrypted.
  - Racing answers are rejected instead of overwriting each other.
  - Live mode makes two calls per turn: a structured extraction, then a streamed question. Offline mode streams scripted questions.
- **Session View**: the full-screen interview. Questions stream in with the Resolve animation, and the Iris shows listening, thinking and speaking. Save and exit, resume on reload, reduced-motion safe.
  - Sessions API: create, resume, answer (Server-Sent Events) and complete.
- **Mandate Builder** (Claude Opus 5.5): a session for the CEO or a board member produces the mandate.
  - Contents: summary, priorities, tensions, non-negotiables, risks, a 90-day scorecard, an interview plan and comp.
  - Every line is editable, the employer confirms it (amber), and any edit clears the confirmation.
  - Comp benchmark (p25, median, p75) is computed from real listings at the same level, market, currency and pay basis. It says "Not enough data" below 5 listings and is never generated by the model.
  - PDF export.
- **Profile Interviewer** (Claude Sonnet 5.5): builds a proof-of-outcomes portfolio and the candidate's ideal next mandate.
  - It never asks about protected attributes; scrubbers drop them, along with contact details and injection attempts.
  - Optional résumé and LinkedIn PDF upload: PDF only, up to 5 MB, encrypted, and contact lines stripped before the interviewer reads it.
- **Candidate approval**: nothing is saved until the candidate has approved, edited or removed every line.
- **Visibility** (hidden by default, anonymous matching, open). Widening goes through the Consent Gate and is logged; narrowing is instant.
- **Blocklist**: the current employer is blocked automatically.
- **Data rights for every user**:
  - **Export:** a decrypted JSON archive, stored encrypted, available through a 5-minute signed link.
  - **Delete:** takes effect immediately, then permanent deletion after a 7-day cancellable grace period.
  - **Retention:** profiles inactive for 24 months are anonymized.
- **Sponsorships**: admins book placements on home, article foot, jobs and the newsletter. Each is labelled "Sponsored", uses `rel="sponsored"`, and has no third-party scripts or pixels. Bookings are audit-logged.
- **Legal pages** (drafts for counsel): privacy, terms, cookies, subprocessors (typed list), and a plain-language AI notice.
- **Cookie consent**: Decline is as prominent as Accept. Global Privacy Control counts as a decline. Analytics stays behind a consent gate.
- **Agent monitoring** (`/console/agents`): runs, cost per agent per day, failure rate, the human queue with audit-logged resolve, and offline eval results.
- **Evals**: Mandate Builder 22 cases and Profile Interviewer 26 cases, all passing offline. Every agent now has at least 22.

### Fixed during integration
- **Session decryption mismatch.** The review screen and the data-export job decrypted interview state with a different key context than the engine used. Review failed to load, and exports silently left transcripts out. There is now one shared definition, and the export test fails if any transcript can't be decrypted.
- **Database policy bug.** Owners couldn't soft-delete their own uploads under migration 0008. Migration 0010 splits the policy.
- **Test isolation.** End-to-end tests now run against their own database (`<db>_e2e`), reset each run. Before this, test articles leaked into the dev database's home page.

### Results
- 299 unit, integration and eval tests; 107 Playwright tests on desktop and mobile with axe.
- Acceptance tests prove:
  - An employer completes, resumes, confirms and exports a mandate.
  - A candidate completes a profile interview, approves it and keeps it hidden.
  - Hidden profiles are invisible to employers, talent partners, editors, admins, readers, other candidates and anonymous visitors, at both the database and API level.

### Stubbed until accounts exist
- Claude API (interviews run offline), Supabase Storage (uploads are stored encrypted in Postgres), PostHog (behind the consent gate), and Clerk-side account deletion.

### Deviations
- Team builds and AI fluency are stored as `profile_outcomes` rows (types `team` and `ai_fluency`) rather than new columns.
- The audit log is append-only, so after deletion it keeps an actor ID that no longer resolves to anyone (LEGAL_REVIEW P11).
- Answer rate limiting is per server instance; correctness across instances comes from the guarded save.

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
