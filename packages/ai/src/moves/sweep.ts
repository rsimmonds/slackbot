import { createHash } from 'node:crypto';
import { adminDb, companies, moves, sourceItems, type Db } from '@cmobeat/db';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { sourceItemMessage, type SourceItemPayload } from '../format';
import type { LlmProvider } from '../provider';
import { runAgent } from '../run-agent';
import { MoveClassificationSchema, MoveDraftSchema, type MoveDraft } from '../schemas/move';
import { isForbiddenSource, type RawSourceItem, type SourceAdapter } from './sources';

export interface SweepOptions {
  now?: Date;
  adapters: SourceAdapter[];
  provider?: LlmProvider;
  db?: Db;
  /** Max items classified per sweep, to bound cost. */
  limit?: number;
}

export interface SweepReport {
  fetched: number;
  inserted: number;
  duplicates: number;
  processed: number;
  irrelevant: number;
  drafted: number;
  failed: number;
  errors: { source: string; message: string }[];
}

export const contentHash = (title: string, body: string) =>
  createHash('sha256')
    .update(`${title.trim().toLowerCase()}\n${body.trim().toLowerCase()}`)
    .digest('hex');

/** Stores new items. Dedupes by URL and by content (the same release on two wires). */
export async function ingest(
  db: Db,
  items: RawSourceItem[],
): Promise<{ inserted: number; duplicates: number }> {
  let inserted = 0;
  let duplicates = 0;
  for (const item of items) {
    if (isForbiddenSource(item.url)) continue;
    const hash = contentHash(item.title, item.text);
    const [existing] = await db
      .select({ id: sourceItems.id })
      .from(sourceItems)
      .where(or(eq(sourceItems.url, item.url), eq(sourceItems.contentHash, hash)))
      .limit(1);
    if (existing) {
      duplicates++;
      continue;
    }
    const rows = await db
      .insert(sourceItems)
      .values({
        kind: item.kind,
        url: item.url,
        title: item.title.slice(0, 500),
        publisher: item.publisher,
        publishedAt: item.publishedAt,
        contentHash: hash,
        excerpt: item.text.slice(0, 8000),
      })
      .onConflictDoNothing({ target: sourceItems.url })
      .returning({ id: sourceItems.id });
    if (rows.length) inserted++;
    else duplicates++;
  }
  return { inserted, duplicates };
}

/**
 * Sources or silence: a draft may only cite the item it came from. Any other URL the model
 * produced is dropped, and the item's own URL is always present.
 */
export function enforceSources(draft: MoveDraft, item: SourceItemPayload): MoveDraft {
  const own = draft.sources
    .filter((s) => s.url === item.url)
    .map((s) => ({ ...s, kind: item.kind }));
  const label = `${item.publisher ?? new URL(item.url).hostname}${item.publishedAt ? `, ${item.publishedAt.slice(0, 10)}` : ''}`;
  return {
    ...draft,
    sources: own.length ? own.slice(0, 1) : [{ url: item.url, label, kind: item.kind }],
  };
}

const domainOf = (url: string) => new URL(url).hostname.replace(/^www\./, '').toLowerCase();

/** Finds the company by name or by the source's domain; creates a minimal row if needed. */
export async function resolveCompany(
  db: Db,
  name: string,
  sourceUrl: string,
): Promise<{ id: string; created: boolean }> {
  const domain = domainOf(sourceUrl);
  const [found] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        isNull(companies.deletedAt),
        or(
          sql`lower(${companies.name}) = ${name.trim().toLowerCase()}`,
          eq(companies.domain, domain),
        ),
      ),
    )
    .limit(1);
  if (found) return { id: found.id, created: false };
  // Not enough is known to classify it. An editor completes these fields before publishing.
  const [created] = await db
    .insert(companies)
    .values({
      name: name.trim(),
      industry: 'Unclassified',
      stage: 'Unknown',
      sizeBand: 'Unknown',
      hqCountry: 'Unknown',
      market: 'US',
    })
    .returning({ id: companies.id });
  return { id: created!.id, created: true };
}

function payloadOf(row: typeof sourceItems.$inferSelect): SourceItemPayload {
  return {
    kind: row.kind,
    url: row.url,
    title: row.title,
    publisher: row.publisher,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    text: row.excerpt ?? '',
  };
}

/** Classifies and drafts one stored item. Drafts always land as status draft for an editor. */
async function processItem(
  db: Db,
  provider: LlmProvider | undefined,
  row: typeof sourceItems.$inferSelect,
  now: Date,
) {
  const item = payloadOf(row);
  const user = sourceItemMessage(item);
  const setStatus = (
    status: 'irrelevant' | 'drafted' | 'failed',
    classification: Record<string, unknown>,
    moveId?: string,
  ) =>
    db
      .update(sourceItems)
      .set({ status, classification, moveId: moveId ?? null, updatedAt: now })
      .where(eq(sourceItems.id, row.id));

  const cls = await runAgent({
    step: 'moves-tracker.classify',
    user,
    schema: MoveClassificationSchema,
    provider,
    db,
    maxTokens: 1000,
  });
  if (!cls.ok) {
    await setStatus('failed', { stage: 'classify', reason: cls.reason, runId: cls.runId });
    return 'failed' as const;
  }
  if (!cls.output.relevant) {
    await setStatus('irrelevant', { ...cls.output, runId: cls.runId });
    return 'irrelevant' as const;
  }

  const draft = await runAgent({
    step: 'moves-tracker.draft',
    user,
    schema: MoveDraftSchema,
    provider,
    db,
    maxTokens: 2000,
  });
  if (!draft.ok) {
    await setStatus('failed', {
      ...cls.output,
      stage: 'draft',
      reason: draft.reason,
      runId: draft.runId,
    });
    return 'failed' as const;
  }

  const d = enforceSources(draft.output, item);
  const company = await resolveCompany(db, d.companyName, item.url);
  const fallbackDate = (row.publishedAt ?? now).toISOString().slice(0, 10);
  const confidence = Math.min(
    d.confidence,
    cls.output.confidence,
    item.kind === 'submission' ? 0.5 : 1,
  );
  const flags = {
    companyCreated: company.created,
    effectiveDateAssumed: d.effectiveDate === null,
    readerTip: item.kind === 'submission',
  };
  const [move] = await db
    .insert(moves)
    .values({
      personName: d.personName,
      companyId: company.id,
      moveType: d.moveType,
      title: d.title,
      effectiveDate: d.effectiveDate ?? fallbackDate,
      sources: d.sources,
      confidence,
      status: 'draft',
      summary: d.summary,
      previousRole: d.previousRole,
      agentRunId: draft.runId,
    })
    .returning({ id: moves.id });
  await setStatus(
    'drafted',
    { ...cls.output, runId: cls.runId, draftRunId: draft.runId, flags },
    move!.id,
  );
  return 'drafted' as const;
}

/**
 * One Moves Tracker sweep (spec 8.2, every 2 hours): fetch public sources, store new items,
 * classify with Haiku, draft relevant ones with Sonnet into the editorial queue. Reader tips
 * submitted since the last sweep are processed the same way. Nothing is ever published here.
 */
export async function runMovesSweep(opts: SweepOptions): Promise<SweepReport> {
  const db = opts.db ?? adminDb();
  const now = opts.now ?? new Date();
  const report: SweepReport = {
    fetched: 0,
    inserted: 0,
    duplicates: 0,
    processed: 0,
    irrelevant: 0,
    drafted: 0,
    failed: 0,
    errors: [],
  };

  for (const adapter of opts.adapters) {
    try {
      const items = await adapter.fetch(now);
      report.fetched += items.length;
      const r = await ingest(db, items);
      report.inserted += r.inserted;
      report.duplicates += r.duplicates;
    } catch (error) {
      report.errors.push({ source: adapter.name, message: (error as Error).message });
    }
  }

  const pending = await db
    .select()
    .from(sourceItems)
    .where(eq(sourceItems.status, 'new'))
    .orderBy(asc(sourceItems.createdAt))
    .limit(opts.limit ?? 25);

  for (const row of pending) {
    try {
      const outcome = await processItem(db, opts.provider, row, now);
      report[outcome]++;
    } catch (error) {
      report.failed++;
      report.errors.push({ source: row.url, message: (error as Error).message });
    }
    report.processed++;
  }
  return report;
}
