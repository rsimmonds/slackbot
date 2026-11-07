import { companies, listings, mandates, type Db, type Tx } from '@cmobeat/db';

/** A user transaction (RLS applies) or the owner connection (background jobs only). */
type Q = Tx | Db;
import { and, asc, count, desc, eq, gt, gte, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import { functionScopes, type JobFilters } from './filters';

/** Columns every job card and detail page needs. */
const jobColumns = {
  listingId: listings.id,
  status: listings.status,
  plan: listings.plan,
  featured: listings.featured,
  publishedAt: listings.publishedAt,
  expiresAt: listings.expiresAt,
  mandateId: mandates.id,
  title: mandates.title,
  level: mandates.level,
  scope: mandates.scope,
  reportingLine: mandates.reportingLine,
  teamSize: mandates.teamSize,
  priorities: mandates.priorities,
  compMin: mandates.compMin,
  compMax: mandates.compMax,
  currency: mandates.currency,
  compBasis: mandates.compBasis,
  workType: mandates.workType,
  location: mandates.location,
  remote: mandates.remote,
  market: mandates.market,
  isSample: listings.isSample,
  companyId: companies.id,
  companyName: companies.name,
  companyIndustry: companies.industry,
  companyStage: companies.stage,
  companySize: companies.sizeBand,
  companyDomain: companies.domain,
};

function jobsQuery(tx: Q) {
  return tx
    .select(jobColumns)
    .from(listings)
    .innerJoin(mandates, eq(mandates.id, listings.mandateId))
    .innerJoin(companies, eq(companies.id, listings.companyId))
    .$dynamic();
}

export type JobRow = Awaited<ReturnType<typeof jobsQuery>>[number];

/** A listing is publicly visible while live and not past its expiry. */
const isPublic = (now: Date) =>
  and(
    eq(listings.status, 'live'),
    isNull(listings.deletedAt),
    or(isNull(listings.expiresAt), gt(listings.expiresAt, now)),
  );

const searchDocument = sql`to_tsvector('english',
  coalesce(${mandates.title}, '') || ' ' || coalesce(${mandates.scope}, '') || ' ' ||
  coalesce(${mandates.priorities}::text, '') || ' ' || coalesce(${companies.name}, '') || ' ' ||
  coalesce(${companies.industry}, '') || ' ' || coalesce(${mandates.location}, ''))`;

export function filterConditions(
  f: Partial<JobFilters>,
  opts: { now?: Date; since?: Date } = {},
): SQL[] {
  const now = opts.now ?? new Date();
  const c: SQL[] = [isPublic(now)!];
  if (f.level) c.push(eq(mandates.level, f.level));
  if (f.work) c.push(eq(mandates.workType, f.work));
  if (f.market) c.push(eq(mandates.market, f.market));
  if (f.remote) c.push(eq(mandates.remote, true));
  if (f.stage) c.push(ilike(companies.stage, f.stage));
  if (f.industry) c.push(ilike(companies.industry, f.industry));
  if (f.currency) {
    c.push(eq(mandates.currency, f.currency));
    // Overlap: the top of the band reaches the minimum. Never across currencies.
    if (f.minComp) c.push(gte(mandates.compMax, f.minComp));
  }
  if (f.scope) {
    const words = functionScopes[f.scope];
    const haystack = sql`lower(coalesce(${mandates.scope}, '') || ' ' || coalesce(${mandates.priorities}::text, ''))`;
    c.push(or(...words.map((w) => sql`${haystack} like ${'%' + w + '%'}`))!);
  }
  if (f.q) c.push(sql`${searchDocument} @@ websearch_to_tsquery('english', ${f.q})`);
  if (opts.since) c.push(gt(listings.publishedAt, opts.since));
  return c;
}

export const PAGE_SIZE = 12;

export async function searchJobs(
  tx: Q,
  f: Partial<JobFilters>,
  opts: { now?: Date; since?: Date; pageSize?: number } = {},
): Promise<{ items: JobRow[]; total: number; page: number; pages: number }> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const page = f.page ?? 1;
  const where = and(...filterConditions(f, opts));
  const [items, [totalRow]] = await Promise.all([
    jobsQuery(tx)
      .where(where)
      .orderBy(desc(listings.featured), desc(listings.publishedAt), asc(listings.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    tx
      .select({ n: count() })
      .from(listings)
      .innerJoin(mandates, eq(mandates.id, listings.mandateId))
      .innerJoin(companies, eq(companies.id, listings.companyId))
      .where(where),
  ]);
  const total = Number(totalRow?.n ?? 0);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Distinct stages and industries among live listings, for the filter menus. */
export async function jobFacets(tx: Q): Promise<{ stages: string[]; industries: string[] }> {
  const rows = await tx
    .selectDistinct({ stage: companies.stage, industry: companies.industry })
    .from(listings)
    .innerJoin(companies, eq(companies.id, listings.companyId))
    .where(isPublic(new Date()));
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  return { stages: uniq(rows.map((r) => r.stage)), industries: uniq(rows.map((r) => r.industry)) };
}

/** One listing with its mandate and company. RLS decides what the viewer may see. */
export async function getJob(tx: Q, listingId: string): Promise<JobRow | null> {
  const [row] = await jobsQuery(tx)
    .where(and(eq(listings.id, listingId), isNull(listings.deletedAt)))
    .limit(1);
  return row ?? null;
}

export const isPubliclyVisible = (job: Pick<JobRow, 'status' | 'expiresAt'>, now = new Date()) =>
  job.status === 'live' && (!job.expiresAt || job.expiresAt > now);

/** Related live roles, for article footers and the job detail page. */
export async function relatedJobs(
  tx: Q,
  job: Pick<JobRow, 'listingId' | 'level'>,
  limit = 3,
): Promise<JobRow[]> {
  return jobsQuery(tx)
    .where(and(isPublic(new Date()), sql`${listings.id} <> ${job.listingId}`))
    .orderBy(
      sql`${mandates.level} = ${job.level} desc`,
      desc(listings.featured),
      desc(listings.publishedAt),
    )
    .limit(limit);
}
