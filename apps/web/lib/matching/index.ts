import 'server-only';
import { randomBytes } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import {
  agentModels,
  costMicros,
  pricing,
  providerName,
  runAgent,
  type ModelId,
} from '@cmobeat/ai';
import { defaultEmbeddings } from '@cmobeat/ai/embeddings';
import {
  buildBlindProfile,
  collectMatcherBatchIfEnded,
  hardFilter,
  matcherUserMessage,
  sanitizeRanking,
  submitMatcherBatch,
  type BatchesClient,
} from '@cmobeat/ai/matching';
import { MatchRankingSchema, type MatchRanking } from '@cmobeat/ai/schemas';
import {
  adminDb,
  agentRuns,
  audit,
  embeddings,
  listings,
  mandates,
  matches,
  searches,
} from '@cmobeat/db';
import {
  and,
  cosineDistance,
  count,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import { loadMandate, loadPool } from './data';
import {
  OWNER,
  refreshMandateEmbedding,
  refreshProfileEmbeddings,
  refreshStaleEmbeddings,
} from './embeddings';

/**
 * Blind two-stage matching (spec 7.1.4–7.1.7).
 *
 * Stage 1: SQL + hard filters (visibility, level, work type, market, comp overlap, blocklist,
 *          not already matched). Stage 2: pgvector shortlist (top 50), then the Matcher ranks
 *          and explains up to 25. Output: `matches` rows with status 'proposed'. Nothing here
 *          ever approves a match; a talent partner does.
 */
export interface ProposeResult {
  mandateId: string;
  considered: number;
  shortlisted: number;
  proposed: string[]; // new match ids
  skippedExisting: number;
}

export interface ProposeOptions {
  actorId: string | null;
  searchId?: string | null;
  /** Restrict the pool (a profile that just became visible). */
  onlyProfileIds?: string[];
}

const SHORTLIST = 50;
const RANK_LIMIT = 25;

const opaqueRef = () => {
  const alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(6);
  return `P${[...bytes].map((b) => alphabet[b % alphabet.length]).join('')}`;
};

/** What stage 1 and the vector shortlist produce for one mandate. Serializable (batch steps). */
export interface Prep {
  mandateId: string;
  user: string | null;
  refToProfile: Record<string, string>;
  similarity: Record<string, number>;
  considered: number;
  eligible: number;
  shortlisted: number;
  skippedExisting: number;
}

export class MatchingError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

async function existingCount(mandateId: string) {
  const [r] = await adminDb()
    .select({ n: count() })
    .from(matches)
    .where(eq(matches.mandateId, mandateId));
  return r?.n ?? 0;
}

export async function prepareMandate(
  mandateId: string,
  opts: Pick<ProposeOptions, 'onlyProfileIds'> = {},
): Promise<Prep> {
  const mandate = await loadMandate(mandateId);
  if (!mandate) throw new MatchingError('Mandate not found.', 404);
  if (!mandate.confirmed) throw new MatchingError('Confirm the mandate before matching.', 409);

  const pool = await loadPool(mandate, opts.onlyProfileIds);
  const eligible = pool.filter((c) => hardFilter(mandate.facts, c.facts).pass);
  const base = {
    mandateId,
    considered: pool.length,
    eligible: eligible.length,
    skippedExisting: await existingCount(mandateId),
  };
  if (!eligible.length)
    return { ...base, user: null, refToProfile: {}, similarity: {}, shortlisted: 0 };

  const provider = defaultEmbeddings();
  const mandateVector = await refreshMandateEmbedding(mandateId, provider);
  await refreshProfileEmbeddings(
    eligible.map((c) => c.profileId),
    { provider },
  );

  const distance = cosineDistance(embeddings.vector, mandateVector!);
  const nearest = await adminDb()
    .select({ ownerId: embeddings.ownerId, distance })
    .from(embeddings)
    .where(
      and(
        eq(embeddings.ownerType, OWNER.profile.ownerType),
        eq(embeddings.kind, OWNER.profile.kind),
        eq(embeddings.model, provider.model),
        inArray(
          embeddings.ownerId,
          eligible.map((c) => c.profileId),
        ),
      ),
    )
    .orderBy(distance)
    .limit(SHORTLIST);

  const byId = new Map(eligible.map((c) => [c.profileId, c]));
  const refToProfile: Record<string, string> = {};
  const similarity: Record<string, number> = {};
  const candidates = nearest.slice(0, RANK_LIMIT).map((n) => {
    let ref = opaqueRef();
    while (refToProfile[ref]) ref = opaqueRef();
    refToProfile[ref] = n.ownerId;
    similarity[ref] = Math.round((1 - Number(n.distance)) * 1000) / 1000;
    return buildBlindProfile(byId.get(n.ownerId)!.raw, ref);
  });

  return {
    ...base,
    shortlisted: nearest.length,
    user: matcherUserMessage(mandate.blind, candidates),
    refToProfile,
    similarity,
  };
}

/** Turn a ranking into proposals. Refs not in this run are dropped; nothing is approved. */
export async function applyRanking(
  prep: Prep,
  ranking: MatchRanking | null,
  runId: string | null,
  opts: ProposeOptions,
  matcher: string,
): Promise<ProposeResult> {
  const db = adminDb();
  const proposed: string[] = [];
  const clean = ranking
    ? sanitizeRanking(ranking, new Set(Object.keys(prep.refToProfile)))
    : { matches: [] };

  for (const m of clean.matches) {
    const profileId = prep.refToProfile[m.ref]!;
    const [row] = await db
      .insert(matches)
      .values({
        mandateId: prep.mandateId,
        profileId,
        // The Matcher works in 0–100; matches stores fit as a fraction (0–1, DB check).
        scoreLow: m.scoreLow / 100,
        scoreHigh: m.scoreHigh / 100,
        rationale: {
          summary: m.summary,
          reasons: m.reasons,
          method: 'blind-two-stage',
          matcher,
          similarity: prep.similarity[m.ref] ?? null,
        },
        status: 'proposed',
        agentRunId: runId,
        searchId: opts.searchId ?? null,
      })
      .onConflictDoNothing({ target: [matches.mandateId, matches.profileId] })
      .returning({ id: matches.id });
    if (!row) continue;
    proposed.push(row.id);
    await audit(db, {
      actorId: opts.actorId,
      action: 'match.proposed',
      targetType: 'match',
      targetId: row.id,
      metadata: {
        mandateId: prep.mandateId,
        scoreLow: m.scoreLow,
        scoreHigh: m.scoreHigh,
        searchId: opts.searchId ?? null,
      },
    });
  }

  await audit(db, {
    actorId: opts.actorId,
    action: 'matching.run',
    targetType: 'mandate',
    targetId: prep.mandateId,
    metadata: {
      considered: prep.considered,
      eligible: prep.eligible,
      shortlisted: prep.shortlisted,
      ranked: clean.matches.length,
      proposed: proposed.length,
      matcher,
      agentRunId: runId,
      outcome: ranking ? 'ranked' : prep.user ? 'queued_for_human' : 'no_eligible_candidates',
      searchId: opts.searchId ?? null,
    },
  });

  return {
    mandateId: prep.mandateId,
    considered: prep.considered,
    shortlisted: prep.shortlisted,
    proposed,
    skippedExisting: prep.skippedExisting,
  };
}

/**
 * CONTRACT (used by the staff console and the search workflow). Runs blind two-stage matching
 * for one confirmed mandate. Idempotent: an existing match for the same mandate and profile, in
 * any status, is never proposed again.
 */
export async function proposeMatchesForMandate(
  mandateId: string,
  opts: ProposeOptions,
): Promise<ProposeResult> {
  const prep = await prepareMandate(mandateId, opts);
  const matcher = providerName() === 'anthropic' ? agentModels.matcher : 'offline';
  if (!prep.user) return applyRanking(prep, null, null, opts, matcher);
  const res = await runAgent({
    step: 'matcher',
    user: prep.user,
    schema: MatchRankingSchema,
    effort: 'medium',
    maxTokens: 16000,
    actorId: opts.actorId,
  });
  return applyRanking(prep, res.ok ? res.output : null, res.runId, opts, matcher);
}

/** Confirmed mandates still hiring: a live listing, or a search that is still open. */
export async function openMandateIds(limit = 200): Promise<string[]> {
  const db = adminDb();
  const rows = await db
    .select({ id: mandates.id })
    .from(mandates)
    .where(
      and(
        isNotNull(mandates.confirmedAt),
        isNull(mandates.deletedAt),
        or(
          exists(
            db
              .select({ one: sql`1` })
              .from(listings)
              .where(
                and(
                  eq(listings.mandateId, mandates.id),
                  eq(listings.status, 'live'),
                  isNull(listings.deletedAt),
                ),
              ),
          ),
          exists(
            db
              .select({ one: sql`1` })
              .from(searches)
              .where(
                and(
                  eq(searches.mandateId, mandates.id),
                  inArray(searches.status, ['scoping', 'sourcing', 'shortlist', 'interviewing']),
                ),
              ),
          ),
        ),
      ),
    )
    .limit(limit);
  return rows.map((r) => r.id);
}

/** A profile just became visible: match it against open mandates (capped per run). */
export async function proposeMatchesForProfile(
  profileId: string,
  opts: { actorId: string | null; cap?: number } = { actorId: null },
): Promise<ProposeResult[]> {
  await refreshProfileEmbeddings([profileId]);
  const out: ProposeResult[] = [];
  for (const mandateId of await openMandateIds(opts.cap ?? 20)) {
    out.push(
      await proposeMatchesForMandate(mandateId, {
        actorId: opts.actorId,
        onlyProfileIds: [profileId],
      }),
    );
  }
  return out;
}

// ------------------------------------------------------------------ nightly

/** Nightly: refresh stale vectors, then match every open mandate. Direct calls (not batched). */
export async function runNightlyMatching(): Promise<{
  embeddings: unknown;
  runs: ProposeResult[];
}> {
  const refreshed = await refreshStaleEmbeddings();
  const runs: ProposeResult[] = [];
  for (const id of await openMandateIds())
    runs.push(await proposeMatchesForMandate(id, { actorId: null }));
  return { embeddings: refreshed, runs };
}

export const useBatchForNightly = () =>
  providerName() === 'anthropic' && process.env.MATCHER_BATCH === '1';

const anthropicBatches = (): BatchesClient => {
  const client = new Anthropic({ maxRetries: 2 });
  return {
    create: (p) => client.messages.batches.create(p as never) as Promise<{ id: string }>,
    retrieve: (id) =>
      client.messages.batches.retrieve(id) as Promise<{ id: string; processing_status: string }>,
    results: (id) => client.messages.batches.results(id) as never,
  };
};

/** Batch path, step 1: prepare every open mandate and submit one batch. */
export async function submitNightlyBatch(client: BatchesClient = anthropicBatches()) {
  await refreshStaleEmbeddings();
  const preps: Prep[] = [];
  for (const id of await openMandateIds()) {
    const p = await prepareMandate(id);
    if (p.user) preps.push(p);
  }
  if (!preps.length) return { batchId: null, preps: [] as Prep[] };
  const batchId = await submitMatcherBatch(
    client,
    preps.map((p) => ({ customId: p.mandateId, user: p.user! })),
  );
  // The user messages are not needed after submission; keep step state small.
  return { batchId, preps: preps.map((p) => ({ ...p, user: null })) };
}

/**
 * Batch path, step 2: if the batch has ended, log each result as an agent run (50% batch
 * price) and propose. Returns null while the batch is still processing.
 */
export async function collectNightlyBatch(
  batchId: string,
  preps: Prep[],
  client: BatchesClient = anthropicBatches(),
): Promise<ProposeResult[] | null> {
  const results = await collectMatcherBatchIfEnded(client, batchId);
  if (!results) return null;
  const db = adminDb();
  const out: ProposeResult[] = [];
  for (const prep of preps) {
    const r = results.get(prep.mandateId);
    const model = (r?.ok ? r.model : agentModels.matcher) as ModelId;
    const [run] = await db
      .insert(agentRuns)
      .values({
        agent: 'matcher',
        model,
        promptVersion: `batch:${batchId}`,
        status: r?.ok ? 'succeeded' : 'failed',
        tokensIn: r?.ok ? r.usage.input : 0,
        tokensOut: r?.ok ? r.usage.output : 0,
        // Message Batches are billed at half the standard rate.
        costMicros:
          r?.ok && model in pricing
            ? Math.round(costMicros(model, { input: r.usage.input, output: r.usage.output }) / 2)
            : 0,
      })
      .returning({ id: agentRuns.id });
    out.push(
      await applyRanking(
        { ...prep, user: prep.user ?? 'batched' },
        r?.ok ? r.output : null,
        run!.id,
        { actorId: null },
        agentModels.matcher,
      ),
    );
  }
  return out;
}
