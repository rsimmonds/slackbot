import 'server-only';
import { companies, listings, mandates, moves, withAnon } from '@cmobeat/db';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { siteUrl } from '@/lib/site';
import {
  decodeCursor,
  encodeCursor,
  MIN_CELL,
  type CompanyQuery,
  type CompQuery,
  type ListingQuery,
  type MoveQuery,
} from './filters';

/*
 * The intelligence read model behind the data API and exports. Every query runs as an
 * ANONYMOUS visitor (withAnon), so row-level security limits it to public data: approved moves,
 * live listings, companies' public fields and aggregates over live listings. Candidate data,
 * matches and every private table are unreachable from here by construction.
 */

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ApiMove {
  id: string;
  person: string;
  company: { name: string; industry: string; market: string };
  type: string;
  title: string;
  previousRole: string | null;
  effectiveDate: string;
  sources: { url: string; label: string; kind: string }[];
  url: string;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const moveCols = {
  id: moves.id,
  person: moves.personName,
  companyName: companies.name,
  industry: companies.industry,
  market: companies.market,
  type: moves.moveType,
  title: moves.title,
  previousRole: moves.previousRole,
  effectiveDate: moves.effectiveDate,
  sources: moves.sources,
};

interface MoveRecord {
  id: string;
  person: string;
  companyName: string;
  industry: string;
  market: string;
  type: string;
  title: string;
  previousRole: string | null;
  effectiveDate: string;
  sources: { url: string; label: string; kind: string }[];
}

function toApiMove(r: MoveRecord): ApiMove {
  return {
    id: r.id,
    person: r.person,
    company: { name: r.companyName, industry: r.industry, market: r.market },
    type: r.type,
    title: r.title,
    previousRole: r.previousRole,
    effectiveDate: r.effectiveDate,
    // Only the documented fields of each source, never anything else stored alongside.
    sources: (r.sources ?? []).map((s) => ({ url: s.url, label: s.label, kind: s.kind })),
    url: `${siteUrl()}/moves/${r.id}`,
  };
}

/** Approved moves, newest first, keyset-paginated on (effective_date, id). */
export async function listMoves(q: MoveQuery): Promise<Page<ApiMove>> {
  const cur = decodeCursor(q.cursor, 2);
  const conds: (SQL | undefined)[] = [eq(moves.status, 'approved')];
  if (q.type) conds.push(eq(moves.moveType, q.type));
  if (q.industry) conds.push(ilike(companies.industry, escapeLike(q.industry)));
  if (q.market) conds.push(eq(companies.market, q.market));
  if (q.company) conds.push(ilike(companies.name, `%${escapeLike(q.company)}%`));
  if (q.from) conds.push(gte(moves.effectiveDate, q.from));
  if (q.to) conds.push(lte(moves.effectiveDate, q.to));
  if (cur) {
    const [d, id] = cur as [string, string];
    conds.push(or(lt(moves.effectiveDate, d), and(eq(moves.effectiveDate, d), lt(moves.id, id))));
  }
  const rows = (await withAnon((tx) =>
    tx
      .select(moveCols)
      .from(moves)
      .innerJoin(companies, eq(companies.id, moves.companyId))
      .where(and(...conds))
      .orderBy(desc(moves.effectiveDate), desc(moves.id))
      .limit(q.limit + 1),
  )) as MoveRecord[];
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return {
    data: page.map(toApiMove),
    nextCursor: rows.length > q.limit && last ? encodeCursor([last.effectiveDate, last.id]) : null,
  };
}

export async function getMove(id: string): Promise<ApiMove | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const [r] = (await withAnon((tx) =>
    tx
      .select(moveCols)
      .from(moves)
      .innerJoin(companies, eq(companies.id, moves.companyId))
      .where(and(eq(moves.id, id), eq(moves.status, 'approved')))
      .limit(1),
  )) as MoveRecord[];
  return r ? toApiMove(r) : null;
}

export interface ApiListing {
  id: string;
  title: string;
  level: string;
  workType: string;
  comp: { min: number; max: number; currency: string; basis: string };
  location: string | null;
  remote: boolean;
  market: string;
  featured: boolean;
  company: { name: string; industry: string; stage: string };
  publishedAt: string | null;
  expiresAt: string | null;
  url: string;
}

/**
 * Live listings only, newest first. Payment, moderation, raw job descriptions and other internal
 * fields are never selected.
 */
export async function listListings(q: ListingQuery): Promise<Page<ApiListing>> {
  const cur = decodeCursor(q.cursor, 2);
  const conds: (SQL | undefined)[] = [eq(listings.status, 'live'), isNull(listings.deletedAt)];
  if (q.level) conds.push(eq(mandates.level, q.level));
  if (q.market) conds.push(eq(mandates.market, q.market));
  if (q.work_type) conds.push(eq(mandates.workType, q.work_type));
  if (cur) {
    const [p, id] = cur as [string, string];
    const at = new Date(p);
    if (Number.isNaN(at.getTime())) decodeCursor('x', 2);
    conds.push(
      or(lt(listings.publishedAt, at), and(eq(listings.publishedAt, at), lt(listings.id, id))),
    );
  }
  const rows = await withAnon((tx) =>
    tx
      .select({
        id: listings.id,
        title: mandates.title,
        level: mandates.level,
        workType: mandates.workType,
        compMin: mandates.compMin,
        compMax: mandates.compMax,
        currency: mandates.currency,
        basis: mandates.compBasis,
        location: mandates.location,
        remote: mandates.remote,
        market: mandates.market,
        featured: listings.featured,
        companyName: companies.name,
        industry: companies.industry,
        stage: companies.stage,
        publishedAt: listings.publishedAt,
        expiresAt: listings.expiresAt,
      })
      .from(listings)
      .innerJoin(mandates, eq(mandates.id, listings.mandateId))
      .innerJoin(companies, eq(companies.id, mandates.companyId))
      .where(and(...conds))
      .orderBy(desc(listings.publishedAt), desc(listings.id))
      .limit(q.limit + 1),
  );
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return {
    data: page.map((r) => ({
      id: r.id,
      title: r.title,
      level: r.level,
      workType: r.workType,
      comp: { min: r.compMin!, max: r.compMax!, currency: r.currency, basis: r.basis },
      location: r.location,
      remote: r.remote,
      market: r.market,
      featured: r.featured,
      company: { name: r.companyName, industry: r.industry, stage: r.stage },
      publishedAt: r.publishedAt?.toISOString() ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      url: `${siteUrl()}/jobs/${r.id}`,
    })),
    nextCursor:
      rows.length > q.limit && last?.publishedAt
        ? encodeCursor([last.publishedAt.toISOString(), last.id])
        : null,
  };
}

export interface CompCell {
  level: string;
  market: string;
  currency: string;
  basis: string;
  n: number;
  /** True when fewer than MIN_CELL listings back the cell: the figures are withheld. */
  suppressed: boolean;
  p25: number | null;
  median: number | null;
  p75: number | null;
}

/**
 * Comp aggregates over live listings: range midpoints by level × market × currency × basis.
 * Currencies are never converted or mixed. Cells under MIN_CELL listings are suppressed.
 */
export async function compAggregates(q: CompQuery): Promise<CompCell[]> {
  const rows = await withAnon((tx) =>
    tx.execute<{
      level: string;
      market: string;
      currency: string;
      comp_basis: string;
      n: number;
      p25: string | null;
      median: string | null;
      p75: string | null;
    }>(sql`
      select m.level, m.market, m.currency, m.comp_basis, count(*)::int as n,
             round(percentile_cont(0.25) within group (order by (m.comp_min + m.comp_max) / 2.0)) as p25,
             round(percentile_cont(0.5) within group (order by (m.comp_min + m.comp_max) / 2.0)) as median,
             round(percentile_cont(0.75) within group (order by (m.comp_min + m.comp_max) / 2.0)) as p75
      from listings l join mandates m on m.id = l.mandate_id
      where l.status = 'live' and l.deleted_at is null
        and m.comp_min is not null and m.comp_max is not null
        ${q.level ? sql`and m.level = ${q.level}` : sql``}
        ${q.market ? sql`and m.market = ${q.market}` : sql``}
        ${q.currency ? sql`and m.currency = ${q.currency}` : sql``}
      group by m.level, m.market, m.currency, m.comp_basis
      order by m.currency, m.comp_basis, m.market, m.level`),
  );
  return [...rows].map((r) => {
    const n = Number(r.n);
    const suppressed = n < MIN_CELL;
    const num = (v: string | null) => (suppressed || v === null ? null : Number(v));
    return {
      level: r.level,
      market: r.market,
      currency: r.currency,
      basis: r.comp_basis,
      n,
      suppressed,
      p25: num(r.p25),
      median: num(r.median),
      p75: num(r.p75),
    };
  });
}

export interface ApiCompany {
  id: string;
  name: string;
  domain: string | null;
  industry: string;
  stage: string;
  sizeBand: string;
  hqCountry: string;
  market: string;
}

/** Companies' public fields, alphabetical, keyset-paginated on (name, id). */
export async function listCompanies(q: CompanyQuery): Promise<Page<ApiCompany>> {
  const cur = decodeCursor(q.cursor, 2);
  const conds: (SQL | undefined)[] = [isNull(companies.deletedAt)];
  if (q.industry) conds.push(ilike(companies.industry, escapeLike(q.industry)));
  if (q.market) conds.push(eq(companies.market, q.market));
  if (cur) {
    const [name, id] = cur as [string, string];
    conds.push(or(gt(companies.name, name), and(eq(companies.name, name), gt(companies.id, id))));
  }
  const rows = await withAnon((tx) =>
    tx
      .select({
        id: companies.id,
        name: companies.name,
        domain: companies.domain,
        industry: companies.industry,
        stage: companies.stage,
        sizeBand: companies.sizeBand,
        hqCountry: companies.hqCountry,
        market: companies.market,
      })
      .from(companies)
      .where(and(...conds))
      .orderBy(asc(companies.name), asc(companies.id))
      .limit(q.limit + 1),
  );
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return {
    data: page,
    nextCursor: rows.length > q.limit && last ? encodeCursor([last.name, last.id]) : null,
  };
}
