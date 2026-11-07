# Changelog

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
