# PLAN.md — {{BRAND_NAME}}

An AI-native publication and hiring platform for CMOs. This plan covers the file tree, data model, agents and phase checklist, plus the decisions that need approval before application code starts.

Status: **Awaiting approval.** No application code has been written.

---

## 0. Decisions needed before Phase 0

| # | Question | My recommendation |
| --- | --- | --- |
| 1 | Brand name | Keep `{{BRAND_NAME}}` in one config constant (`packages/config/brand.ts`) so the rename is one line. Needed before public pages and email templates ship (Phase 1). |
| 2 | Repository | This repo is named `slackbot`. Build here, or should I start in a new repo? |
| 3 | Auth | **Clerk.** Magic links, Google, Microsoft, enforced MFA and org seats all come built in. Auth.js would need custom MFA. |
| 4 | Database + storage | **Supabase** (Postgres + pgvector + Storage + Vault). One fewer subprocessor than Neon + R2, and Vault covers field-encryption keys. Drizzle stays the ORM, so we can move later. |
| 5 | Jobs | **Inngest.** First-class Vercel integration, durable steps, cron. |
| 6 | Field encryption | Envelope encryption: one data key per record, wrapped by a KMS key (Supabase Vault in prod, a local key in dev). Encrypted columns are `bytea`, never queried. |
| 7 | Launch markets | Assume US + Canada, USD and CAD. Affects comp fields, tax on Stripe, CASL. Confirm. |
| 8 | Fractional comp | Store fractional roles as a monthly retainer range (`comp_basis = monthly_retainer`), not annual. Confirm. |

### Constraints of this build environment
I can write, test and push the whole codebase here, but I can't create the Vercel, Supabase, Clerk, Stripe, Resend, Inngest, Voyage or Anthropic accounts. Every external service sits behind an interface with a local fake, so the app runs end to end in dev and CI without keys. You (or I, once keys exist as environment secrets) connect the real services for preview and production deploys.

---

## 1. File tree

pnpm workspaces + Turborepo. One app, shared packages.

```
.
├── PLAN.md  README.md  CHANGELOG.md  LEGAL_REVIEW.md  .env.example
├── turbo.json  pnpm-workspace.yaml  tsconfig.base.json
├── .github/workflows/          ci.yml (lint, typecheck, unit, integration, e2e, contrast, evals, secret + dep scan)
├── agents/                     one folder per agent (section 3)
│   ├── _shared/voice.md        voice rules from spec 4.7, included in every prompt
│   ├── moves-tracker/          prompt.md  schema.ts  evals/*.json (20+)
│   ├── listing-parser/
│   ├── mandate-builder/
│   ├── profile-interviewer/
│   ├── matcher/                + fairness/ (paired synthetic profiles)
│   └── editorial-assistant/
├── apps/web/                   Next.js App Router
│   ├── app/
│   │   ├── (public)/           home, articles/[slug], interviews/[slug], moves, moves/[id],
│   │   │                       data, newsletter, jobs, jobs/[id], legal/*
│   │   ├── (employer)/employer/ post-job, mandates/[id], sessions/[id], searches/[id], team, billing
│   │   ├── (candidate)/me/     profile, interview/[id], visibility, matches, digest, data-rights
│   │   ├── (staff)/console/    editorial, moves, matches, listings, users, companies,
│   │   │                       payments, sponsorships, agents
│   │   ├── api/                listings, mandates, sessions, profiles, matches, moves, articles,
│   │   │                       newsletter, billing, admin, inngest, v1 (read-only data API, Phase 4)
│   │   ├── sitemap.ts  robots.ts  llms.txt/route.ts
│   ├── lib/                    auth/roles, rbac, rate-limit, audit, consent, crypto, seo (JSON-LD)
│   ├── inngest/                moves-sweep, nightly-match, listing-expiry, digests,
│   │                           embedding-refresh, weekly-fairness
│   └── e2e/                    Playwright specs per phase "done when" criterion
├── packages/
│   ├── ui/                     design system: tokens.css, themes, type scale, Tailwind preset,
│   │                           Iris, MeshPanel, SessionView, MovesFeed, MatchDossier,
│   │                           ConsentGate, CommandPalette, DataCard, SignalLine, Resolve
│   │                           + Storybook
│   ├── db/                     Drizzle schema, migrations, RLS policies (SQL), seed script
│   ├── ai/                     Anthropic client, models.ts (single source of model names),
│   │                           runAgent() (structured output via tool use, Zod, retry-once,
│   │                           fallback to human queue, agent_runs logging, OTel spans),
│   │                           embeddings (Voyage), PII stripper, eval runner
│   ├── services/               interfaces + real/fake adapters: payments (Stripe),
│   │                           email + NewsletterProvider (Resend Broadcasts), storage,
│   │                           kms, analytics (PostHog), search
│   ├── emails/                 React Email templates in the design system
│   └── config/                 brand, prices, plans, feature flags, env schema (Zod)
```

---

## 2. Data model

Postgres + pgvector, Drizzle migrations. Every table: `id uuid pk`, `created_at`, `updated_at`. Soft delete (`deleted_at`) where marked †.

| Table | Key fields | Notes |
| --- | --- | --- |
| `users` † | email, auth_provider_id, display_name | Roles in `user_roles` so one user holds several |
| `user_roles` | user_id, role (reader, candidate, employer, editor, talent_partner, admin) | |
| `companies` † | name, domain, industry, stage, size_band, hq_country, logo_url | |
| `employer_members` | user_id, company_id, seat_role (owner, admin, member) | |
| `candidate_profiles` † | user_id, visibility (hidden\|anonymous\|open, default hidden), headline, years_experience, current_company_id, level, work_types[], locations[], comp_floor (enc), resume_ref (enc), contact (enc), last_active_at | RLS: owner + talent partners on approved matches only |
| `profile_outcomes` | profile_id, outcome_type, metric, value, context, evidence_note, candidate_approved_at | Candidate approves every line |
| `profile_blocklist` | profile_id, company_id | Current employer pre-filled |
| `mandates` † | company_id, source (builder\|listing), title, level, scope, reporting_line, team_size, priorities jsonb, scorecard jsonb, interview_plan jsonb, comp_min, comp_max, currency, comp_basis (annual\|monthly_retainer), work_type, location, remote, confirmed_at | |
| `listings` † | mandate_id, status (draft, pending_payment, pending_review, live, expired), plan, featured, published_at, expires_at | Comp required to publish (DB check) |
| `saved_searches` | user_id, query jsonb, alert_frequency | |
| `applications` | listing_id, profile_id, consent_id, status | Insert requires a consent row |
| `consents` | subject_user_id, kind (apply, reveal, share), scope jsonb, granted_at, withdrawn_at | Every Consent Gate decision |
| `searches` | mandate_id, plan, status, talent_partner_id, fee_terms jsonb, stripe_invoice_id | |
| `matches` | mandate_id, profile_id, score_low, score_high, rationale jsonb, status (proposed, approved, rejected, revealed), reviewed_by, reviewed_at, agent_run_id | Employer view = approved/revealed only |
| `reveal_requests` | match_id, requested_by, candidate_decision, decided_at, consent_id | |
| `messages` | match_id, sender_id, body (enc) | Only after reveal |
| `interview_sessions` | owner_id, kind (mandate\|profile), status, question_index, transcript jsonb (enc for profile), draft_output jsonb | Save and resume |
| `embeddings` | owner_type, owner_id, kind, vector(1024), model | HNSW index |
| `moves` | person_name, company_id, move_type, title, effective_date, sources jsonb (≥1, checked), confidence, status (draft, approved, rejected), approved_by | |
| `articles` † | slug, type (story, interview, report), title, dek, body_mdx, media jsonb, chapters jsonb, author_id, editor_id, status, published_at | Publish requires editor_id |
| `subscribers` | email, segments[], source, status (pending, active, unsubscribed), confirm_token, consent_at | |
| `newsletter_issues` | subject, body_mdx, status, sent_at, provider_ref | |
| `sponsorships` | sponsor_name, placement, creative jsonb, start_date, end_date, amount | |
| `subscriptions`, `payments` | stripe customer/product/price/status refs, seats | |
| `api_keys` | company_id, hashed_key, scopes, last_used_at | Phase 4 |
| `agent_runs` | agent, model, prompt_version, input_ref, output_ref, tokens_in, tokens_out, cost, latency_ms, status | Every AI call |
| `human_queue` | agent_run_id, reason, resolved_by | Failed or invalid agent output |
| `audit_log` | actor_id, action, target_type, target_id, metadata, at | Append-only (no UPDATE/DELETE grant) |

**Row-level security.** The app connects as a restricted role and sets `app.user_id` and `app.roles` per transaction. Policies enforce: candidates see only their own profile; employers have **no** grant on candidate tables and read a `employer_match_view` that exposes only approved matches, with identity columns null until a consented reveal; blocklisted companies are filtered inside that view. Integration tests assert each role's access directly against Postgres.

---

## 3. Agents

Model names live only in `packages/ai/models.ts`. I'll confirm the strings against the Claude docs before Phase 1.

| Agent | Model | Trigger | Output (Zod) | Human check |
| --- | --- | --- | --- | --- |
| Moves Tracker | `claude-haiku-5-5` classify → `claude-sonnet-5-5` draft | Inngest cron, 2h | Move draft + sources + confidence | Editor approves |
| Listing Parser | `claude-haiku-5-5` | Employer pastes JD/URL | Mandate JSON | Employer confirms |
| Mandate Builder | `claude-opus-5-5` | Employer session | Mandate, 90-day scorecard, comp benchmark, interview plan | Employer edits; staff on paid searches |
| Profile Interviewer | `claude-sonnet-5-5` | Candidate session | Outcomes portfolio + ideal next mandate | Candidate approves each line |
| Matcher | `claude-opus-5-5` (Batch API nightly) | New mandate/profile, nightly | Ranked matches, score range, rationale | Talent partner approves each |
| Editorial Assistant | `claude-sonnet-5-5` | Editor request; weekly | Headlines, summaries, newsletter draft | Editor rewrites + approves |

Shared runtime (`runAgent`): tool-use structured output → Zod validate → retry once → else `human_queue`; prompt caching on system prompts; streaming for user-facing calls (drives Iris + Resolve); `agent_runs` row and OTel span on every call.

Matching pipeline: PII stripper (name, photo, age, gender, pronouns, nationality, grad years, school names, free-text scrub) → SQL hard filters (level, work type, comp overlap, location, blocklist) → pgvector top-N → Matcher ranks and explains top 25 → `matches.status = proposed` → talent partner review.

Evals: 20+ fixtures per agent in `agents/<name>/evals`, run in CI against recorded responses (deterministic) plus an opt-in live run when `ANTHROPIC_API_KEY` is set. Matcher fairness suite: paired profiles differing only in protected attributes; fails CI if match-rate ratio drops below the four-fifths threshold.

Moves sources: company newsrooms (RSS), press wires, SEC EDGAR 8-K Item 5.02, user submissions. No LinkedIn or ToS-restricted scraping.

---

## 4. Phase checklist

Each phase ends with a deployable app, a `CHANGELOG.md` entry, and a checkpoint (built / stubbed / open questions) before the next starts.

### Phase 0: Foundations
- [ ] pnpm + Turborepo, TS strict, ESLint, Prettier, CI on every PR
- [ ] Tokens (both themes), type scale, motion tokens, grain/mesh/glow utilities
- [ ] Eight signature components with Storybook stories; automated WCAG AA contrast check in CI
- [ ] Clerk auth, roles, staff MFA + 12h sessions
- [ ] Drizzle schema, migrations, RLS policies, RLS integration tests
- [ ] Seed script: 40 companies, 60 CMO profiles, 30 listings, 12 articles, all marked sample data
- [ ] `.env.example`, `README.md`, `LEGAL_REVIEW.md` started
- [ ] Vercel preview/prod config
- **Done when:** each role signs in to an empty styled dashboard in both themes; contrast check passes.

### Phase 1: Publication and job board
- [ ] Home, articles, interviews, Moves archive + move pages, data pages, newsletter (double opt-in, archive, preferences)
- [ ] Staff editorial queue with MDX editor and approve/reject
- [ ] Moves Tracker → editorial queue
- [ ] Jobs index (filters, comp on every card), job detail, saved searches, alerts
- [ ] Post-a-job: Listing Parser → confirm → Stripe checkout → moderation → live
- [ ] SEO: JSON-LD, sitemaps, `llms.txt`
- **Done when:** Playwright covers editor publishing a move and article, reader subscribing, employer paying for and publishing a parsed listing.

### Phase 2: AI layer
- [ ] Session View with streaming, Iris states, save/resume
- [ ] Mandate Builder + PDF export
- [ ] Profile Interviewer, visibility controls, blocklist, data export, delete
- [ ] Sponsorship placements
- **Done when:** employer completes and exports a mandate; candidate completes a profile, sets hidden, and tests show no other role can see it.

### Phase 3: Matching
- [ ] Blind two-stage matching with rationale
- [ ] Staff match review, Match Dossier, Consent Gate, reveal flow, messaging
- [ ] Paid search + fractional match invoicing
- [ ] Fairness report + all agent evals in CI
- **Done when:** a mandate produces a shortlist, a talent partner approves two, a candidate consents to one reveal, the employer sees only that one, and every step is in `audit_log`.

### Phase 4: Scale
- [ ] Employer subscriptions with seats and unlimited posts
- [ ] Intelligence exports + read-only API with keys
- [ ] Gated annual report downloads feeding the subscriber list
- [ ] Candidate concierge tier
- **Done when:** a subscriber pulls a moves dataset through the API; the report captures leads.

---

## 5. Items flagged for `LEGAL_REVIEW.md` (not decided in code)

NYC Local Law 144 bias-audit scope and candidate notice wording; EU AI Act high-risk obligations if EU candidates are allowed; CASL consent wording; 24-month anonymization policy; success-fee terms (12% / 15%) and whether the platform acts as a recruiting agency in any jurisdiction; Moves Tracker use of press content (quotation length, attribution); privacy policy, cookie consent and subprocessor list.
