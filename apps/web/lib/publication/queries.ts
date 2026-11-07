import 'server-only';
import type { CompBasis, Currency } from '@cmobeat/config';
import {
  articles,
  companies,
  listings,
  mandates,
  moves,
  newsletterIssues,
  type Tx,
} from '@cmobeat/db';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { Level, MarketCode, MoveType } from './labels';

/*
 * Public read model. Every function takes a transaction opened with asViewer(), so row-level
 * security decides what is visible: anonymous visitors see only published articles, approved
 * moves, live listings and companies.
 */

export type ArticleType = 'story' | 'interview' | 'report';

export interface ArticleCard {
  id: string;
  slug: string;
  type: ArticleType;
  title: string;
  dek: string | null;
  publishedAt: Date;
  words: number;
}

const articleCardCols = {
  id: articles.id,
  slug: articles.slug,
  type: articles.type,
  title: articles.title,
  dek: articles.dek,
  publishedAt: articles.publishedAt,
  words: sql<number>`array_length(regexp_split_to_array(trim(${articles.bodyMdx}), '\\s+'), 1)`,
};

const published = and(eq(articles.status, 'published'), isNull(articles.deletedAt));

export async function listArticles(
  tx: Tx,
  opts: { types?: ArticleType[]; limit?: number; offset?: number } = {},
): Promise<ArticleCard[]> {
  const where = opts.types?.length ? and(published, inArray(articles.type, opts.types)) : published;
  const rows = await tx
    .select(articleCardCols)
    .from(articles)
    .where(where)
    .orderBy(desc(articles.publishedAt))
    .limit(opts.limit ?? 24)
    .offset(opts.offset ?? 0);
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt!, words: Number(r.words ?? 0) }));
}

export interface ArticleDetail extends ArticleCard {
  bodyMdx: string;
  takeaways: string[];
  media: { kind?: 'audio' | 'video'; src?: string | null; durationSec?: number } | null;
  chapters: { title: string; at: number }[] | null;
  author: string | null;
  editor: string | null;
  updatedAt: Date;
}

export async function getArticle(
  tx: Tx,
  slug: string,
  types?: ArticleType[],
): Promise<ArticleDetail | null> {
  const rows = await tx.execute<{
    id: string;
    slug: string;
    type: ArticleType;
    title: string;
    dek: string | null;
    published_at: string;
    updated_at: string;
    body_mdx: string;
    takeaways: string[];
    media: ArticleDetail['media'];
    chapters: ArticleDetail['chapters'];
    author: string | null;
    editor: string | null;
  }>(sql`
    select a.id, a.slug, a.type, a.title, a.dek, a.published_at, a.updated_at, a.body_mdx,
           a.takeaways, a.media, a.chapters, au.display_name as author, ed.display_name as editor
    from articles a
    left join public_bylines au on au.id = a.author_id
    left join public_bylines ed on ed.id = a.editor_id
    where a.slug = ${slug} and a.status = 'published' and a.deleted_at is null
    limit 1`);
  const r = rows[0];
  if (!r || (types?.length && !types.includes(r.type))) return null;
  return {
    id: r.id,
    slug: r.slug,
    type: r.type,
    title: r.title,
    dek: r.dek,
    publishedAt: new Date(r.published_at),
    updatedAt: new Date(r.updated_at),
    bodyMdx: r.body_mdx,
    words: r.body_mdx.split(/\s+/).filter(Boolean).length,
    takeaways: r.takeaways ?? [],
    media: r.media,
    chapters: r.chapters,
    author: r.author,
    editor: r.editor,
  };
}

// ---------------------------------------------------------------- listings (read-only here)

export interface RoleCard {
  id: string;
  title: string;
  level: Level;
  company: string;
  location: string | null;
  remote: boolean;
  workType: 'full_time' | 'fractional';
  compMin: number | null;
  compMax: number | null;
  currency: Currency;
  compBasis: CompBasis;
  featured: boolean;
  publishedAt: Date | null;
}

export async function liveRoles(
  tx: Tx,
  opts: { featuredOnly?: boolean; limit?: number } = {},
): Promise<RoleCard[]> {
  const where = and(
    eq(listings.status, 'live'),
    isNull(listings.deletedAt),
    opts.featuredOnly ? eq(listings.featured, true) : undefined,
  );
  return tx
    .select({
      id: listings.id,
      title: mandates.title,
      level: mandates.level,
      company: companies.name,
      location: mandates.location,
      remote: mandates.remote,
      workType: mandates.workType,
      compMin: mandates.compMin,
      compMax: mandates.compMax,
      currency: mandates.currency,
      compBasis: mandates.compBasis,
      featured: listings.featured,
      publishedAt: listings.publishedAt,
    })
    .from(listings)
    .innerJoin(mandates, eq(mandates.id, listings.mandateId))
    .innerJoin(companies, eq(companies.id, listings.companyId))
    .where(where)
    .orderBy(desc(listings.featured), desc(listings.publishedAt))
    .limit(opts.limit ?? 3);
}

// ---------------------------------------------------------------- moves

export interface MoveRow {
  id: string;
  personName: string;
  moveType: MoveType;
  title: string;
  effectiveDate: string;
  company: string;
  companyId: string;
  industry: string;
  market: MarketCode;
}

const moveCols = {
  id: moves.id,
  personName: moves.personName,
  moveType: moves.moveType,
  title: moves.title,
  effectiveDate: moves.effectiveDate,
  company: companies.name,
  companyId: companies.id,
  industry: companies.industry,
  market: companies.market,
};

export async function recentMoves(tx: Tx, limit = 8): Promise<MoveRow[]> {
  return tx
    .select(moveCols)
    .from(moves)
    .innerJoin(companies, eq(companies.id, moves.companyId))
    .where(eq(moves.status, 'approved'))
    .orderBy(desc(moves.effectiveDate), desc(moves.createdAt))
    .limit(limit);
}

export interface MoveFilters {
  q?: string;
  type?: MoveType;
  industry?: string;
  market?: MarketCode;
  company?: string;
  from?: string;
  to?: string;
}

export async function searchMoves(
  tx: Tx,
  f: MoveFilters,
  page = 1,
  pageSize = 30,
): Promise<{ rows: MoveRow[]; total: number }> {
  const conds: (SQL | undefined)[] = [eq(moves.status, 'approved')];
  if (f.type) conds.push(eq(moves.moveType, f.type));
  if (f.industry) conds.push(eq(companies.industry, f.industry));
  if (f.market) conds.push(eq(companies.market, f.market));
  if (f.company) conds.push(eq(companies.id, f.company));
  if (f.from) conds.push(gte(moves.effectiveDate, f.from));
  if (f.to) conds.push(lte(moves.effectiveDate, f.to));
  if (f.q) {
    // Full-text search over person, title and company. 'simple' keeps names unstemmed.
    conds.push(
      sql`to_tsvector('simple', ${moves.personName} || ' ' || ${moves.title} || ' ' || ${companies.name})
          @@ websearch_to_tsquery('simple', ${f.q})`,
    );
  }
  const where = and(...conds);
  const [rows, count] = await Promise.all([
    tx
      .select(moveCols)
      .from(moves)
      .innerJoin(companies, eq(companies.id, moves.companyId))
      .where(where)
      .orderBy(desc(moves.effectiveDate), asc(moves.personName))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(moves)
      .innerJoin(companies, eq(companies.id, moves.companyId))
      .where(where),
  ]);
  return { rows, total: count[0]?.n ?? 0 };
}

export interface MoveDetail extends MoveRow {
  summary: string | null;
  previousRole: string | null;
  sources: { url: string; label: string; kind: string }[];
  companyDomain: string | null;
  companyStage: string;
  approvedAt: Date | null;
  updatedAt: Date;
}

export async function getMove(tx: Tx, id: string): Promise<MoveDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await tx
    .select({
      ...moveCols,
      summary: moves.summary,
      previousRole: moves.previousRole,
      sources: moves.sources,
      companyDomain: companies.domain,
      companyStage: companies.stage,
      approvedAt: moves.approvedAt,
      updatedAt: moves.updatedAt,
    })
    .from(moves)
    .innerJoin(companies, eq(companies.id, moves.companyId))
    .where(and(eq(moves.id, id), eq(moves.status, 'approved')))
    .limit(1);
  return r ?? null;
}

/** Facet values for the Moves filters, drawn only from approved moves. */
export async function moveFacets(tx: Tx) {
  const rows = await tx
    .selectDistinct({ id: companies.id, name: companies.name, industry: companies.industry })
    .from(moves)
    .innerJoin(companies, eq(companies.id, moves.companyId))
    .where(eq(moves.status, 'approved'))
    .orderBy(asc(companies.name));
  return {
    companies: rows.map((r) => ({ id: r.id, name: r.name })),
    industries: [...new Set(rows.map((r) => r.industry))].sort(),
  };
}

// ---------------------------------------------------------------- data page aggregates

export async function movesByIndustry(tx: Tx): Promise<{ industry: string; n: number }[]> {
  return tx
    .select({ industry: companies.industry, n: sql<number>`count(*)::int` })
    .from(moves)
    .innerJoin(companies, eq(companies.id, moves.companyId))
    .where(eq(moves.status, 'approved'))
    .groupBy(companies.industry)
    .orderBy(desc(sql`count(*)`), asc(companies.industry));
}

export async function movesLastDays(tx: Tx, days: number): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(moves)
    .where(
      and(
        eq(moves.status, 'approved'),
        gte(moves.effectiveDate, sql`(current_date - ${days}::int)`),
      ),
    );
  return r?.n ?? 0;
}

export interface CompBand {
  level: Level;
  currency: Currency;
  compBasis: CompBasis;
  n: number;
  /** Median of listing minimums and maximums, rounded to the nearest 1,000. */
  medianMin: number;
  medianMax: number;
  lowest: number;
  highest: number;
}

/** Comp ranges from live listings, grouped by level within each currency and basis. */
export async function compBands(tx: Tx): Promise<CompBand[]> {
  const rows = await tx.execute<{
    level: Level;
    currency: Currency;
    comp_basis: CompBasis;
    n: number;
    median_min: number;
    median_max: number;
    lowest: number;
    highest: number;
  }>(sql`
    select m.level, m.currency, m.comp_basis, count(*)::int as n,
           round(percentile_cont(0.5) within group (order by m.comp_min) / 1000) * 1000 as median_min,
           round(percentile_cont(0.5) within group (order by m.comp_max) / 1000) * 1000 as median_max,
           min(m.comp_min) as lowest, max(m.comp_max) as highest
    from listings l join mandates m on m.id = l.mandate_id
    where l.status = 'live' and l.deleted_at is null and m.comp_min is not null and m.comp_max is not null
    group by m.level, m.currency, m.comp_basis
    order by m.currency, m.comp_basis, m.level`);
  return rows.map((r) => ({
    level: r.level,
    currency: r.currency,
    compBasis: r.comp_basis,
    n: Number(r.n),
    medianMin: Number(r.median_min),
    medianMax: Number(r.median_max),
    lowest: Number(r.lowest),
    highest: Number(r.highest),
  }));
}

// ---------------------------------------------------------------- newsletter archive

export async function sentIssues(tx: Tx) {
  return tx
    .select({
      id: newsletterIssues.id,
      subject: newsletterIssues.subject,
      sentAt: newsletterIssues.sentAt,
    })
    .from(newsletterIssues)
    .where(eq(newsletterIssues.status, 'sent'))
    .orderBy(desc(newsletterIssues.sentAt))
    .limit(100);
}

export async function getIssue(tx: Tx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await tx
    .select()
    .from(newsletterIssues)
    .where(and(eq(newsletterIssues.id, id), eq(newsletterIssues.status, 'sent')))
    .limit(1);
  return r ?? null;
}

// ---------------------------------------------------------------- sitemap

export async function sitemapEntries(tx: Tx) {
  const [arts, mvs] = await Promise.all([
    tx
      .select({ slug: articles.slug, type: articles.type, updatedAt: articles.updatedAt })
      .from(articles)
      .where(published),
    tx
      .select({ id: moves.id, updatedAt: moves.updatedAt })
      .from(moves)
      .where(eq(moves.status, 'approved')),
  ]);
  return { articles: arts, moves: mvs };
}
