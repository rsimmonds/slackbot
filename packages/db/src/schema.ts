import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { compBases, currencies, markets, roles } from '@cmobeat/config';

/** Encrypted fields are opaque bytea blobs produced by `encryptField`. Never queried. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

// ---------------------------------------------------------------- enums

export const roleEnum = pgEnum('role', roles);
export const marketEnum = pgEnum('market', markets);
export const currencyEnum = pgEnum('currency', currencies);
export const compBasisEnum = pgEnum('comp_basis', compBases);
export const dataRegionEnum = pgEnum('data_region', ['us', 'eu']);
export const visibilityEnum = pgEnum('visibility', ['hidden', 'anonymous', 'open']);
export const seatRoleEnum = pgEnum('seat_role', ['owner', 'admin', 'member']);
export const levelEnum = pgEnum('level', [
  'vp_marketing',
  'cmo',
  'chief_growth_officer',
  'fractional_cmo',
]);
export const workTypeEnum = pgEnum('work_type', ['full_time', 'fractional']);
export const mandateSourceEnum = pgEnum('mandate_source', ['builder', 'listing']);
export const listingStatusEnum = pgEnum('listing_status', [
  'draft',
  'pending_payment',
  'pending_review',
  'live',
  'expired',
  'rejected',
]);
export const listingPlanEnum = pgEnum('listing_plan', ['standard', 'featured', 'subscription']);
export const consentKindEnum = pgEnum('consent_kind', ['apply', 'reveal', 'share']);
export const applicationStatusEnum = pgEnum('application_status', [
  'submitted',
  'viewed',
  'declined',
  'advanced',
  'withdrawn',
]);
export const searchPlanEnum = pgEnum('search_plan', ['ai_search', 'fractional_match']);
export const searchStatusEnum = pgEnum('search_status', [
  'scoping',
  'sourcing',
  'shortlist',
  'interviewing',
  'placed',
  'closed',
]);
export const matchStatusEnum = pgEnum('match_status', [
  'proposed',
  'approved',
  'rejected',
  'revealed',
]);
export const matchResponseEnum = pgEnum('match_response', [
  'pending',
  'interested',
  'declined',
  'question',
]);
export const revealDecisionEnum = pgEnum('reveal_decision', ['pending', 'accepted', 'declined']);
export const sessionKindEnum = pgEnum('session_kind', ['mandate', 'profile']);
export const sessionStatusEnum = pgEnum('session_status', [
  'active',
  'paused',
  'complete',
  'abandoned',
]);
export const moveTypeEnum = pgEnum('move_type', ['appointed', 'departed', 'promoted']);
export const moveStatusEnum = pgEnum('move_status', ['draft', 'approved', 'rejected']);
export const articleTypeEnum = pgEnum('article_type', ['story', 'interview', 'report']);
export const articleStatusEnum = pgEnum('article_status', [
  'draft',
  'in_review',
  'published',
  'rejected',
]);
export const subscriberStatusEnum = pgEnum('subscriber_status', [
  'pending',
  'active',
  'unsubscribed',
]);
export const issueStatusEnum = pgEnum('issue_status', ['draft', 'approved', 'sent']);
export const agentRunStatusEnum = pgEnum('agent_run_status', [
  'running',
  'succeeded',
  'failed',
  'queued_for_human',
]);

// ---------------------------------------------------------------- shared columns

const id = () => uuid('id').primaryKey().defaultRandom();
const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
const softDelete = () => ({ deletedAt: timestamp('deleted_at', { withTimezone: true }) });
const isSample = () => ({ isSample: boolean('is_sample').notNull().default(false) });

// ---------------------------------------------------------------- identity

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  authProviderId: text('auth_provider_id').unique(),
  displayName: text('display_name').notNull(),
  dataRegion: dataRegionEnum('data_region').notNull().default('us'),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  ...isSample(),
  ...timestamps(),
  ...softDelete(),
});

export const userRoles = pgTable(
  'user_roles',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('user_roles_user_role_uq').on(t.userId, t.role)],
);

export const companies = pgTable(
  'companies',
  {
    id: id(),
    name: text('name').notNull(),
    domain: text('domain'),
    industry: text('industry').notNull(),
    stage: text('stage').notNull(),
    sizeBand: text('size_band').notNull(),
    hqCountry: text('hq_country').notNull(),
    market: marketEnum('market').notNull(),
    logoUrl: text('logo_url'),
    ...isSample(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [uniqueIndex('companies_domain_uq').on(t.domain)],
);

export const employerMembers = pgTable(
  'employer_members',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    seatRole: seatRoleEnum('seat_role').notNull().default('member'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('employer_members_user_company_uq').on(t.userId, t.companyId)],
);

// ---------------------------------------------------------------- candidates

export const candidateProfiles = pgTable(
  'candidate_profiles',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    visibility: visibilityEnum('visibility').notNull().default('hidden'),
    headline: text('headline'),
    yearsExperience: integer('years_experience'),
    currentCompanyId: uuid('current_company_id').references(() => companies.id),
    level: levelEnum('level'),
    workTypes: workTypeEnum('work_types')
      .array()
      .notNull()
      .default(sql`'{}'`),
    locations: text('locations')
      .array()
      .notNull()
      .default(sql`'{}'`),
    compFloor: bytea('comp_floor'),
    resumeRef: bytea('resume_ref'),
    contact: bytea('contact'),
    dataRegion: dataRegionEnum('data_region').notNull().default('us'),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    /** The candidate's ideal next mandate, from the Profile Interviewer, approved by them. */
    idealMandate: jsonb('ideal_mandate').$type<Record<string, unknown>>(),
    /** When the candidate acknowledged the plain-language AI notice (spec 9.7). */
    aiNoticeAckAt: timestamp('ai_notice_ack_at', { withTimezone: true }),
    ...isSample(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('candidate_profiles_visibility_idx').on(t.visibility)],
);

export const profileOutcomes = pgTable(
  'profile_outcomes',
  {
    id: id(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    outcomeType: text('outcome_type').notNull(),
    metric: text('metric').notNull(),
    value: text('value').notNull(),
    context: text('context'),
    evidenceNote: text('evidence_note'),
    candidateApprovedAt: timestamp('candidate_approved_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index('profile_outcomes_profile_idx').on(t.profileId)],
);

export const profileBlocklist = pgTable(
  'profile_blocklist',
  {
    id: id(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('profile_blocklist_uq').on(t.profileId, t.companyId)],
);

// ---------------------------------------------------------------- mandates and listings

export const mandates = pgTable(
  'mandates',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    source: mandateSourceEnum('source').notNull(),
    title: text('title').notNull(),
    level: levelEnum('level').notNull(),
    scope: text('scope'),
    reportingLine: text('reporting_line'),
    teamSize: integer('team_size'),
    priorities: jsonb('priorities').$type<string[]>().notNull().default([]),
    scorecard: jsonb('scorecard').$type<Record<string, unknown>>().notNull().default({}),
    interviewPlan: jsonb('interview_plan').$type<Record<string, unknown>>().notNull().default({}),
    compMin: integer('comp_min'),
    compMax: integer('comp_max'),
    currency: currencyEnum('currency').notNull(),
    compBasis: compBasisEnum('comp_basis').notNull().default('annual'),
    workType: workTypeEnum('work_type').notNull(),
    location: text('location'),
    remote: boolean('remote').notNull().default(false),
    market: marketEnum('market').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    /** What the employer pasted, and where it came from, for the Listing Parser. */
    rawSource: text('raw_source'),
    sourceUrl: text('source_url'),
    /** Mandate Builder narrative: summary, what success looks like, risks, non-negotiables. */
    document: jsonb('document').$type<Record<string, unknown>>(),
    /** Comp benchmark computed from listings data (never model-invented). */
    compBenchmark: jsonb('comp_benchmark').$type<Record<string, unknown>>(),
    ...isSample(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('mandates_company_idx').on(t.companyId),
    check(
      'mandates_comp_range_chk',
      sql`${t.compMin} is null or ${t.compMax} is null or (${t.compMin} > 0 and ${t.compMin} <= ${t.compMax})`,
    ),
    check(
      'mandates_comp_basis_chk',
      sql`(${t.workType} = 'fractional') = (${t.compBasis} = 'monthly_retainer')`,
    ),
  ],
);

export const listings = pgTable(
  'listings',
  {
    id: id(),
    mandateId: uuid('mandate_id')
      .notNull()
      .references(() => mandates.id),
    /** Copied from the mandate by trigger. Lets RLS check ownership without a policy cycle. */
    companyId: uuid('company_id').references(() => companies.id),
    status: listingStatusEnum('status').notNull().default('draft'),
    plan: listingPlanEnum('plan').notNull().default('standard'),
    featured: boolean('featured').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Checkout session reference (Stripe or the local fake). */
    checkoutRef: text('checkout_ref').unique(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    moderatedBy: uuid('moderated_by').references(() => users.id),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    moderationNote: text('moderation_note'),
    ...isSample(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('listings_status_idx').on(t.status),
    index('listings_company_idx').on(t.companyId),
    check('listings_company_chk', sql`${t.companyId} is not null`),
    check(
      'listings_live_dates_chk',
      sql`${t.status} <> 'live' or (${t.publishedAt} is not null and ${t.expiresAt} is not null)`,
    ),
  ],
);

export const savedSearches = pgTable('saved_searches', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  query: jsonb('query').$type<Record<string, unknown>>().notNull(),
  name: text('name'),
  alertFrequency: text('alert_frequency').notNull().default('weekly'),
  lastAlertedAt: timestamp('last_alerted_at', { withTimezone: true }),
  ...timestamps(),
});

// ---------------------------------------------------------------- consent, applications, matching

export const consents = pgTable(
  'consents',
  {
    id: id(),
    subjectUserId: uuid('subject_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: consentKindEnum('kind').notNull(),
    /** Who will see what, as shown in the Consent Gate at the moment of consent. */
    scope: jsonb('scope').$type<Record<string, unknown>>().notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index('consents_subject_idx').on(t.subjectUserId)],
);

export const applications = pgTable(
  'applications',
  {
    id: id(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    consentId: uuid('consent_id')
      .notNull()
      .references(() => consents.id),
    status: applicationStatusEnum('status').notNull().default('submitted'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('applications_listing_profile_uq').on(t.listingId, t.profileId)],
);

export const searches = pgTable('searches', {
  id: id(),
  mandateId: uuid('mandate_id')
    .notNull()
    .references(() => mandates.id),
  plan: searchPlanEnum('plan').notNull(),
  status: searchStatusEnum('status').notNull().default('scoping'),
  talentPartnerId: uuid('talent_partner_id').references(() => users.id),
  feeTerms: jsonb('fee_terms').$type<Record<string, unknown>>().notNull().default({}),
  stripeInvoiceId: text('stripe_invoice_id'),
  /** Placement: the match that was hired, the agreed comp, and when. Drives the success-fee invoice. */
  placedMatchId: uuid('placed_match_id'),
  hiredAt: timestamp('hired_at', { withTimezone: true }),
  /** First-year cash comp (ai_search) or monthly retainer (fractional_match), in minor-free whole units. */
  placementComp: integer('placement_comp'),
  placementCurrency: currencyEnum('placement_currency'),
  invoiceStatus: text('invoice_status'),
  ...timestamps(),
});

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: id(),
    agent: text('agent').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    inputRef: text('input_ref'),
    outputRef: text('output_ref'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    /** USD, micro-dollars. */
    costMicros: integer('cost_micros').notNull().default(0),
    latencyMs: integer('latency_ms'),
    status: agentRunStatusEnum('status').notNull().default('running'),
    ...timestamps(),
  },
  (t) => [index('agent_runs_agent_created_idx').on(t.agent, t.createdAt)],
);

export const matches = pgTable(
  'matches',
  {
    id: id(),
    mandateId: uuid('mandate_id')
      .notNull()
      .references(() => mandates.id),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    scoreLow: real('score_low').notNull(),
    scoreHigh: real('score_high').notNull(),
    rationale: jsonb('rationale').$type<Record<string, unknown>>().notNull(),
    status: matchStatusEnum('status').notNull().default('proposed'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** The candidate's answer to an approved match, before any reveal. */
    candidateResponse: matchResponseEnum('candidate_response').notNull().default('pending'),
    /** Encrypted note or question from the candidate to their talent partner. */
    candidateNote: bytea('candidate_note'),
    candidateRespondedAt: timestamp('candidate_responded_at', { withTimezone: true }),
    /** Set when the match was made for a paid search. */
    searchId: uuid('search_id').references(() => searches.id),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('matches_mandate_profile_uq').on(t.mandateId, t.profileId),
    check(
      'matches_score_range_chk',
      sql`${t.scoreLow} >= 0 and ${t.scoreLow} <= ${t.scoreHigh} and ${t.scoreHigh} <= 1`,
    ),
    check(
      'matches_reviewed_chk',
      sql`${t.status} in ('proposed') or (${t.reviewedBy} is not null and ${t.reviewedAt} is not null)`,
    ),
  ],
);

export const revealRequests = pgTable('reveal_requests', {
  id: id(),
  matchId: uuid('match_id')
    .notNull()
    .references(() => matches.id, { onDelete: 'cascade' }),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => users.id),
  candidateDecision: revealDecisionEnum('candidate_decision').notNull().default('pending'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  consentId: uuid('consent_id').references(() => consents.id),
  ...timestamps(),
});

export const messages = pgTable('messages', {
  id: id(),
  matchId: uuid('match_id')
    .notNull()
    .references(() => matches.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id')
    .notNull()
    .references(() => users.id),
  body: bytea('body').notNull(),
  ...timestamps(),
});

export const interviewSessions = pgTable(
  'interview_sessions',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: sessionKindEnum('kind').notNull(),
    /** Company the mandate session is for. Null for profile sessions. */
    companyId: uuid('company_id').references(() => companies.id),
    status: sessionStatusEnum('status').notNull().default('active'),
    questionIndex: integer('question_index').notNull().default(0),
    maxQuestions: integer('max_questions').notNull().default(15),
    /** Short display reference shown in the Session View corner, e.g. "MB-7Q2K". */
    publicRef: text('public_ref')
      .notNull()
      .unique()
      .default(sql`upper(substr(md5(gen_random_uuid()::text), 1, 8))`),
    /** What the session produced, once complete. */
    mandateId: uuid('mandate_id').references(() => mandates.id),
    profileId: uuid('profile_id').references(() => candidateProfiles.id),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Encrypted session state (transcript + working draft) — always encrypted, for both kinds. */
    transcript: bytea('transcript'),
    /** Unencrypted working draft for MANDATE sessions only (no personal data). Profile drafts live in `transcript`. */
    draftOutput: jsonb('draft_output').$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  (t) => [index('interview_sessions_owner_idx').on(t.ownerId)],
);

export const embeddings = pgTable(
  'embeddings',
  {
    id: id(),
    ownerType: text('owner_type').notNull(),
    ownerId: uuid('owner_id').notNull(),
    kind: text('kind').notNull(),
    vector: vector('vector', { dimensions: 1024 }).notNull(),
    model: text('model').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('embeddings_owner_kind_uq').on(t.ownerType, t.ownerId, t.kind),
    index('embeddings_vector_hnsw_idx').using('hnsw', t.vector.op('vector_cosine_ops')),
  ],
);

// ---------------------------------------------------------------- publication

export const moves = pgTable(
  'moves',
  {
    id: id(),
    personName: text('person_name').notNull(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moveType: moveTypeEnum('move_type').notNull(),
    title: text('title').notNull(),
    effectiveDate: date('effective_date').notNull(),
    sources: jsonb('sources').$type<{ url: string; label: string; kind: string }[]>().notNull(),
    confidence: real('confidence'),
    status: moveStatusEnum('status').notNull().default('draft'),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    /** One-paragraph summary shown on the move page. */
    summary: text('summary'),
    previousRole: text('previous_role'),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id),
    reviewNote: text('review_note'),
    ...isSample(),
    ...timestamps(),
  },
  (t) => [
    index('moves_status_date_idx').on(t.status, t.effectiveDate),
    check(
      'moves_sources_chk',
      sql`jsonb_typeof(${t.sources}) = 'array' and jsonb_array_length(${t.sources}) >= 1`,
    ),
    check('moves_approved_chk', sql`${t.status} <> 'approved' or ${t.approvedBy} is not null`),
  ],
);

export const articles = pgTable(
  'articles',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    type: articleTypeEnum('type').notNull(),
    title: text('title').notNull(),
    dek: text('dek'),
    bodyMdx: text('body_mdx').notNull(),
    media: jsonb('media').$type<Record<string, unknown>>(),
    chapters: jsonb('chapters').$type<{ title: string; at: number }[]>(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    editorId: uuid('editor_id').references(() => users.id),
    status: articleStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id),
    /** Pull quotes and key takeaways, editor-curated. */
    takeaways: jsonb('takeaways').$type<string[]>().notNull().default([]),
    ...isSample(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('articles_status_published_idx').on(t.status, t.publishedAt),
    check(
      'articles_published_chk',
      sql`${t.status} <> 'published' or (${t.editorId} is not null and ${t.publishedAt} is not null)`,
    ),
  ],
);

export const subscribers = pgTable('subscribers', {
  id: id(),
  email: text('email').notNull().unique(),
  segments: text('segments')
    .array()
    .notNull()
    .default(sql`'{}'`),
  source: text('source'),
  status: subscriberStatusEnum('status').notNull().default('pending'),
  confirmToken: text('confirm_token').unique(),
  confirmTokenExpiresAt: timestamp('confirm_token_expires_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  /** Long-lived token for one-click unsubscribe and the preference centre. */
  manageToken: text('manage_token').unique(),
  market: marketEnum('market'),
  /** { frequency: 'weekly' | 'monthly', topics: string[] } */
  preferences: jsonb('preferences')
    .$type<{ frequency: 'weekly' | 'monthly'; topics: string[] }>()
    .notNull()
    .default({ frequency: 'weekly', topics: [] }),
  consentAt: timestamp('consent_at', { withTimezone: true }),
  /** Exact consent wording shown at signup (CASL record-keeping). */
  consentText: text('consent_text'),
  unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
  ...timestamps(),
});

export const newsletterIssues = pgTable('newsletter_issues', {
  id: id(),
  subject: text('subject').notNull(),
  bodyMdx: text('body_mdx').notNull(),
  status: issueStatusEnum('status').notNull().default('draft'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  providerRef: text('provider_ref'),
  ...timestamps(),
});

export const sponsorships = pgTable('sponsorships', {
  id: id(),
  sponsorName: text('sponsor_name').notNull(),
  placement: text('placement').notNull(),
  creative: jsonb('creative').$type<Record<string, unknown>>().notNull().default({}),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  /** Minor units. */
  amount: integer('amount').notNull(),
  currency: currencyEnum('currency').notNull().default('USD'),
  ...timestamps(),
});

// ---------------------------------------------------------------- billing

export const subscriptions = pgTable('subscriptions', {
  id: id(),
  companyId: uuid('company_id').references(() => companies.id),
  userId: uuid('user_id').references(() => users.id),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  product: text('product').notNull(),
  stripePriceId: text('stripe_price_id').notNull(),
  status: text('status').notNull(),
  seats: integer('seats').notNull().default(1),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  ...timestamps(),
});

export const payments = pgTable('payments', {
  id: id(),
  companyId: uuid('company_id').references(() => companies.id),
  userId: uuid('user_id').references(() => users.id),
  stripeCustomerId: text('stripe_customer_id'),
  stripeRef: text('stripe_ref').notNull().unique(),
  product: text('product').notNull(),
  amount: integer('amount').notNull(),
  currency: currencyEnum('currency').notNull(),
  status: text('status').notNull(),
  ...timestamps(),
});

export const apiKeys = pgTable('api_keys', {
  id: id(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** Human label, e.g. "Board dashboard". */
  name: text('name').notNull().default('API key'),
  /** First characters of the key, shown so people can tell keys apart. The key itself is only hashed. */
  prefix: text('prefix').notNull().default(''),
  createdBy: uuid('created_by').references(() => users.id),
  hashedKey: text('hashed_key').notNull().unique(),
  scopes: text('scopes')
    .array()
    .notNull()
    .default(sql`'{}'`),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...timestamps(),
});

// ---------------------------------------------------------------- operations

export const humanQueue = pgTable('human_queue', {
  id: id(),
  agentRunId: uuid('agent_run_id')
    .notNull()
    .references(() => agentRuns.id),
  reason: text('reason').notNull(),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  ...timestamps(),
});

/** Append-only. UPDATE and DELETE are blocked by trigger and by grants. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    /** No FK: audit rows outlive the users they mention. */
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [
    index('audit_log_target_idx').on(t.targetType, t.targetId),
    index('audit_log_actor_idx').on(t.actorId, t.at),
  ],
);

// ---------------------------------------------------------------- Phase 1

export const emailStatusEnum = pgEnum('email_status', ['queued', 'sent', 'failed']);

/** Every outbound email. The local provider only writes here; Resend also records its id. */
export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: id(),
    toEmail: text('to_email').notNull(),
    subject: text('subject').notNull(),
    template: text('template').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref'),
    status: emailStatusEnum('status').notNull().default('queued'),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index('email_outbox_to_idx').on(t.toEmail, t.createdAt)],
);

export const sourceKindEnum = pgEnum('source_kind', ['newsroom', 'wire', 'edgar', 'submission']);
export const sourceItemStatusEnum = pgEnum('source_item_status', [
  'new',
  'irrelevant',
  'drafted',
  'failed',
]);

/** Public items the Moves Tracker has seen. Deduped by URL; never re-drafted. */
export const sourceItems = pgTable(
  'source_items',
  {
    id: id(),
    kind: sourceKindEnum('kind').notNull(),
    url: text('url').notNull().unique(),
    title: text('title').notNull(),
    publisher: text('publisher'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    contentHash: text('content_hash').notNull(),
    excerpt: text('excerpt'),
    status: sourceItemStatusEnum('status').notNull().default('new'),
    classification: jsonb('classification').$type<Record<string, unknown>>(),
    moveId: uuid('move_id').references(() => moves.id),
    submittedBy: uuid('submitted_by').references(() => users.id),
    ...timestamps(),
  },
  (t) => [index('source_items_status_idx').on(t.status, t.createdAt)],
);

// ---------------------------------------------------------------- Phase 2

export const filePurposeEnum = pgEnum('file_purpose', [
  'resume',
  'linkedin_pdf',
  'media',
  'data_export',
]);

/**
 * Encrypted uploads. The local provider stores the encrypted bytes here; the Supabase Storage
 * provider stores only a reference. Owner-only by RLS; never served without a signed URL.
 */
export const files = pgTable(
  'files',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: filePurposeEnum('purpose').notNull(),
    /** Encrypted original filename. */
    filename: bytea('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    provider: text('provider').notNull().default('local'),
    /** Encrypted bytes (local provider) or null when stored externally. */
    content: bytea('content'),
    storageRef: text('storage_ref'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('files_owner_idx').on(t.ownerId)],
);

export const dataRequestKindEnum = pgEnum('data_request_kind', ['export', 'delete']);
export const dataRequestStatusEnum = pgEnum('data_request_status', [
  'pending',
  'completed',
  'cancelled',
]);

/** Self-serve data rights (spec 9.5). Deletes complete within 30 days. */
export const dataRequests = pgTable(
  'data_requests',
  {
    id: id(),
    userId: uuid('user_id').notNull(),
    kind: dataRequestKindEnum('kind').notNull(),
    status: dataRequestStatusEnum('status').notNull().default('pending'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** For exports: the files row holding the export archive. */
    resultFileId: uuid('result_file_id'),
    ...timestamps(),
  },
  (t) => [index('data_requests_status_idx').on(t.status, t.dueAt)],
);

// ---------------------------------------------------------------- Phase 3

/**
 * Weekly fairness report for the Matcher (spec 7.1.9, NYC LL144, EU AI Act). Built from synthetic
 * profiles that differ only in protected attributes, plus aggregate match-rate statistics.
 */
export const fairnessReports = pgTable('fairness_reports', {
  id: id(),
  agent: text('agent').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  passed: boolean('passed').notNull(),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull(),
  ...timestamps(),
});

// ---------------------------------------------------------------- Phase 4

/** Invitations to an employer seat. The token is emailed once and stored only as a hash. */
export const employerInvites = pgTable(
  'employer_invites',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    seatRole: seatRoleEnum('seat_role').notNull().default('member'),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index('employer_invites_company_idx').on(t.companyId)],
);

/** One row per data API request: rate limiting and usage reporting. No request bodies. */
export const apiRequests = pgTable(
  'api_requests',
  {
    id: id(),
    apiKeyId: uuid('api_key_id')
      .notNull()
      .references(() => apiKeys.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    status: integer('status').notNull(),
    rows: integer('rows').notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('api_requests_key_time_idx').on(t.apiKeyId, t.createdAt)],
);

/** Gated report downloads. Each is tied to a subscriber (lead) who gave consent at the gate. */
export const reportDownloads = pgTable(
  'report_downloads',
  {
    id: id(),
    reportSlug: text('report_slug').notNull(),
    subscriberId: uuid('subscriber_id').references(() => subscribers.id, { onDelete: 'set null' }),
    /**
     * The address the report was sent to. Kept for the report delivery and lead record only: it is
     * NOT a newsletter subscription. Marketing email needs the separate, unticked opt-in below,
     * which goes through double opt-in in `subscribers`.
     */
    email: text('email'),
    newsletterOptIn: boolean('newsletter_opt_in').notNull().default(false),
    company: text('company'),
    role: text('role'),
    market: marketEnum('market'),
    ...timestamps(),
  },
  (t) => [index('report_downloads_slug_idx').on(t.reportSlug, t.createdAt)],
);

export const coachingStatusEnum = pgEnum('coaching_status', [
  'requested',
  'scheduled',
  'done',
  'cancelled',
]);

/** Concierge tier: a candidate asks for human coaching. The topic is encrypted. */
export const coachingRequests = pgTable(
  'coaching_requests',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topic: bytea('topic').notNull(),
    status: coachingStatusEnum('status').notNull().default('requested'),
    talentPartnerId: uuid('talent_partner_id').references(() => users.id),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index('coaching_requests_status_idx').on(t.status, t.createdAt)],
);
