import 'server-only';
import type { CompBasis, Currency } from '@cmobeat/config';
import { companies, moves, type Tx } from '@cmobeat/db';
import { and, eq, sql } from 'drizzle-orm';
import type { Level, MarketCode, MoveType } from './labels';

/*
 * Aggregates for the public data pages and the annual report. Every function takes a transaction
 * opened as an anonymous visitor (withAnon / asViewer(null)), so RLS limits it to approved moves,
 * live listings and companies. Nothing here returns a person or a single listing.
 */

/** Cells with fewer observations than this are suppressed, never shown. */
export const MIN_CELL = 5;

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export interface Scope {
  industry?: string;
  market?: MarketCode;
  /** Inclusive calendar year, by effective date (moves). */
  year?: number;
}

function moveWhere(scope: Scope) {
  const parts = [eq(moves.status, 'approved')];
  if (scope.industry) parts.push(eq(companies.industry, scope.industry));
  if (scope.market) parts.push(eq(companies.market, scope.market));
  if (scope.year)
    parts.push(sql`extract(year from ${moves.effectiveDate}) = ${scope.year}` as never);
  return and(...parts);
}

export async function moveCountsByType(tx: Tx, scope: Scope = {}) {
  const rows = await tx
    .select({ type: moves.moveType, n: sql<number>`count(*)::int` })
    .from(moves)
    .innerJoin(companies, eq(companies.id, moves.companyId))
    .where(moveWhere(scope))
    .groupBy(moves.moveType);
  const out: Record<MoveType, number> = { appointed: 0, departed: 0, promoted: 0 };
  for (const r of rows) out[r.type as MoveType] = Number(r.n);
  return out;
}

export async function moveCountsBy(
  tx: Tx,
  dimension: 'industry' | 'market',
  scope: Scope = {},
): Promise<{ key: string; n: number }[]> {
  const col = dimension === 'industry' ? companies.industry : companies.market;
  const rows = await tx
    .select({ key: sql<string>`${col}::text`, n: sql<number>`count(*)::int` })
    .from(moves)
    .innerJoin(companies, eq(companies.id, moves.companyId))
    .where(moveWhere(scope))
    .groupBy(col)
    .orderBy(sql`count(*) desc`, col);
  return rows.map((r) => ({ key: r.key, n: Number(r.n) }));
}

export interface CompCell {
  level: Level;
  market: MarketCode;
  currency: Currency;
  compBasis: CompBasis;
  n: number;
  medianMin: number;
  medianMax: number;
}

/**
 * Advertised comp from live listings, level × market × currency × pay basis. Cells under
 * MIN_CELL are dropped here and only their count is returned, so a single listing can never be
 * read back out of an aggregate.
 */
export async function compCells(
  tx: Tx,
  scope: Pick<Scope, 'industry' | 'market'> = {},
): Promise<{ cells: CompCell[]; suppressed: number; listings: number }> {
  const filters = [
    sql`l.status = 'live'`,
    sql`l.deleted_at is null`,
    sql`m.comp_min is not null`,
    sql`m.comp_max is not null`,
  ];
  if (scope.industry) filters.push(sql`c.industry = ${scope.industry}`);
  if (scope.market) filters.push(sql`m.market = ${scope.market}::market`);
  const rows = await tx.execute<{
    level: Level;
    market: MarketCode;
    currency: Currency;
    comp_basis: CompBasis;
    n: number;
    median_min: number;
    median_max: number;
  }>(sql`
    select m.level, m.market, m.currency, m.comp_basis, count(*)::int as n,
           round(percentile_cont(0.5) within group (order by m.comp_min) / 1000) * 1000 as median_min,
           round(percentile_cont(0.5) within group (order by m.comp_max) / 1000) * 1000 as median_max
    from listings l
    join mandates m on m.id = l.mandate_id
    join companies c on c.id = m.company_id
    where ${sql.join(filters, sql` and `)}
    group by m.level, m.market, m.currency, m.comp_basis
    order by m.currency, m.comp_basis, m.level`);
  const all = [...rows].map((r) => ({
    level: r.level,
    market: r.market,
    currency: r.currency,
    compBasis: r.comp_basis,
    n: Number(r.n),
    medianMin: Number(r.median_min),
    medianMax: Number(r.median_max),
  }));
  return {
    cells: all.filter((c) => c.n >= MIN_CELL),
    suppressed: all.filter((c) => c.n < MIN_CELL).length,
    listings: all.reduce((s, c) => s + c.n, 0),
  };
}

/** Comp transparency and shape of the live board. */
export async function listingStats(tx: Tx, scope: Pick<Scope, 'industry' | 'market'> = {}) {
  const filters = [sql`l.status = 'live'`, sql`l.deleted_at is null`];
  if (scope.industry) filters.push(sql`c.industry = ${scope.industry}`);
  if (scope.market) filters.push(sql`m.market = ${scope.market}::market`);
  const [r] = await tx.execute<{
    live: number;
    with_comp: number;
    fractional: number;
    remote: number;
  }>(sql`
    select count(*)::int as live,
           count(*) filter (where m.comp_min is not null and m.comp_max is not null)::int as with_comp,
           count(*) filter (where m.work_type = 'fractional')::int as fractional,
           count(*) filter (where m.remote)::int as remote
    from listings l
    join mandates m on m.id = l.mandate_id
    join companies c on c.id = m.company_id
    where ${sql.join(filters, sql` and `)}`);
  return {
    live: Number(r?.live ?? 0),
    withComp: Number(r?.with_comp ?? 0),
    fractional: Number(r?.fractional ?? 0),
    remote: Number(r?.remote ?? 0),
  };
}

/** Industries that have at least one approved move or live listing, with their URL slug. */
export async function publicIndustries(tx: Tx): Promise<{ industry: string; slug: string }[]> {
  const rows = await tx.execute<{ industry: string }>(sql`
    select distinct c.industry from companies c
    where exists (select 1 from moves mv where mv.company_id = c.id and mv.status = 'approved')
       or exists (select 1 from listings l join mandates m on m.id = l.mandate_id
                  where m.company_id = c.id and l.status = 'live' and l.deleted_at is null)
    order by c.industry`);
  return [...rows].map((r) => ({ industry: r.industry, slug: slugify(r.industry) }));
}

export const publicMarkets: MarketCode[] = ['US', 'CA', 'EU', 'UK'];

/** Ratio as a whole percent; 0 when the base is 0. */
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
