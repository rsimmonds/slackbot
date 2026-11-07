import { articles, audit, type Tx } from '@cmobeat/db';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Viewer } from '../auth';
import { asViewer } from '../db';
import { EditorialError, requireEditorial } from './access';
import { checkMdx } from './mdx-check';
import { stableStringify } from './moves';

export const articleTypes = ['story', 'interview', 'report'] as const;
export const reviewStatuses = ['draft', 'in_review', 'rejected'] as const;

export function slugify(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'untitled'
  );
}

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const articleInputSchema = z
  .object({
    type: z.enum(articleTypes),
    title: z.string().trim().min(3, 'Add a headline.').max(200),
    slug: z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only.')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    dek: nullableText(400),
    bodyMdx: z.string().max(200_000),
    takeaways: z.array(z.string().trim().min(1).max(280)).max(8).default([]),
    mediaUrl: z
      .union([z.url({ protocol: /^https$/ }), z.literal('')])
      .nullish()
      .transform((v) => v || null),
    chapters: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(160),
          at: z.coerce.number().int().min(0).max(86_400),
        }),
      )
      .max(40)
      .default([]),
  })
  .transform((v) => ({ ...v, slug: v.slug || slugify(v.title) }));
export type ArticleInput = z.output<typeof articleInputSchema>;

const articleColumns = {
  id: articles.id,
  slug: articles.slug,
  type: articles.type,
  title: articles.title,
  dek: articles.dek,
  bodyMdx: articles.bodyMdx,
  media: articles.media,
  chapters: articles.chapters,
  takeaways: articles.takeaways,
  authorId: articles.authorId,
  editorId: articles.editorId,
  status: articles.status,
  publishedAt: articles.publishedAt,
  reviewNote: articles.reviewNote,
  agentRunId: articles.agentRunId,
  createdAt: articles.createdAt,
  updatedAt: articles.updatedAt,
};

export type ArticleRow = NonNullable<Awaited<ReturnType<typeof getArticle>>>;

function toRow(input: ArticleInput) {
  return {
    type: input.type,
    title: input.title,
    slug: input.slug,
    dek: input.dek,
    bodyMdx: input.bodyMdx,
    takeaways: input.takeaways,
    media: input.type === 'interview' && input.mediaUrl ? { url: input.mediaUrl } : null,
    chapters: input.type === 'interview' ? input.chapters : null,
  };
}

async function ensureUniqueSlug(tx: Tx, slug: string, exceptId?: string) {
  const [clash] = await tx
    .select({ id: articles.id })
    .from(articles)
    .where(
      exceptId ? and(eq(articles.slug, slug), ne(articles.id, exceptId)) : eq(articles.slug, slug),
    )
    .limit(1);
  if (clash)
    throw new EditorialError('conflict', `The slug "${slug}" is already used. Choose another.`);
}

export async function getArticle(tx: Tx, idOrSlug: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const [row] = await tx
    .select(articleColumns)
    .from(articles)
    .where(
      and(
        isUuid ? eq(articles.id, idOrSlug) : eq(articles.slug, idOrSlug),
        isNull(articles.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Bylines: published authors are public to everyone; staff also see colleagues' names through
 * staff_bylines. Anyone not visible to the viewer shows as "Staff writer".
 */
export async function bylines(tx: Tx, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await tx.execute<{ id: string; display_name: string }>(
    sql`select id, display_name from public_bylines where id in (${sql.join(
      unique.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
        union
        select id, display_name from staff_bylines where id in (${sql.join(
          unique.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
  );
  return new Map([...rows].map((r) => [r.id, r.display_name]));
}

export async function listQueueArticles(viewer: Viewer) {
  requireEditorial(viewer);
  return asViewer(viewer, (tx) =>
    tx
      .select(articleColumns)
      .from(articles)
      .where(and(inArray(articles.status, [...reviewStatuses]), isNull(articles.deletedAt)))
      .orderBy(
        sql`case ${articles.status} when 'in_review' then 0 when 'draft' then 1 else 2 end`,
        asc(articles.updatedAt),
      ),
  );
}

export const articleFiltersSchema = z.object({
  type: z.enum(articleTypes).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

/** Public read: published articles only, whoever asks. */
export async function listPublishedArticles(
  viewer: Viewer | null,
  filters: z.infer<typeof articleFiltersSchema>,
) {
  return asViewer(viewer, (tx) =>
    tx
      .select({
        id: articles.id,
        slug: articles.slug,
        type: articles.type,
        title: articles.title,
        dek: articles.dek,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          isNull(articles.deletedAt),
          filters.type ? eq(articles.type, filters.type) : undefined,
        ),
      )
      .orderBy(desc(articles.publishedAt))
      .limit(filters.limit)
      .offset(filters.offset),
  );
}

export async function getEditableArticle(viewer: Viewer, id: string) {
  requireEditorial(viewer);
  return asViewer(viewer, (tx) => getArticle(tx, id));
}

export async function createArticle(viewer: Viewer, input: unknown) {
  requireEditorial(viewer);
  const data = articleInputSchema.parse(input);
  return asViewer(viewer, async (tx) => {
    await ensureUniqueSlug(tx, data.slug);
    const [row] = await tx
      .insert(articles)
      .values({ ...toRow(data), authorId: viewer.id, status: 'draft' })
      .returning({ id: articles.id, slug: articles.slug });
    await audit(tx, {
      actorId: viewer.id,
      action: 'article.created',
      targetType: 'article',
      targetId: row!.id,
    });
    return row!;
  });
}

async function loadEditable(tx: Tx, id: string) {
  const a = await getArticle(tx, id);
  if (!a) throw new EditorialError('not_found', 'That article does not exist.');
  return a;
}

export async function updateArticle(viewer: Viewer, id: string, input: unknown) {
  requireEditorial(viewer);
  const data = articleInputSchema.parse(input);
  return asViewer(viewer, async (tx) => {
    const before = await loadEditable(tx, id);
    if (before.status === 'published') {
      throw new EditorialError(
        'conflict',
        'This article is published. Corrections arrive in a later phase.',
      );
    }
    await ensureUniqueSlug(tx, data.slug, id);
    // An edit to a rejected draft returns it to draft.
    await tx
      .update(articles)
      .set({ ...toRow(data), status: before.status === 'rejected' ? 'draft' : before.status })
      .where(eq(articles.id, id));
    const changed = Object.entries(toRow(data))
      .filter(([k, v]) => stableStringify(before[k as keyof typeof before]) !== stableStringify(v))
      .map(([k]) => k);
    if (changed.length) {
      await audit(tx, {
        actorId: viewer.id,
        action: 'article.edited',
        targetType: 'article',
        targetId: id,
        metadata: { changedFields: changed },
      });
    }
    return { id, slug: data.slug };
  });
}

export const transitionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit') }),
  z.object({ action: z.literal('publish'), confirmOwn: z.boolean().optional() }),
  z.object({
    action: z.literal('reject'),
    note: z.string().trim().min(3, 'Say why, briefly.').max(1000),
  }),
]);
export type Transition = z.infer<typeof transitionSchema>;

/**
 * draft → in_review → published, or → rejected (back to draft on the next edit).
 * The publishing editor is recorded as editor_id. Publishing your own draft needs an explicit
 * confirmation, so self-review is a deliberate choice, never an accident.
 */
export async function transitionArticle(viewer: Viewer, id: string, input: unknown) {
  requireEditorial(viewer);
  const t = transitionSchema.parse(input);
  return asViewer(viewer, async (tx) => {
    const a = await loadEditable(tx, id);
    if (t.action === 'submit') {
      if (a.status !== 'draft' && a.status !== 'rejected') {
        throw new EditorialError('conflict', 'Only drafts can be submitted for review.');
      }
      await assertCompiles(a.bodyMdx);
      await tx
        .update(articles)
        .set({ status: 'in_review', reviewNote: null })
        .where(eq(articles.id, id));
      await audit(tx, {
        actorId: viewer.id,
        action: 'article.submitted',
        targetType: 'article',
        targetId: id,
      });
      return { id, status: 'in_review' as const };
    }
    if (t.action === 'publish') {
      if (a.status !== 'in_review') {
        throw new EditorialError('conflict', 'Submit the draft for review before publishing.');
      }
      const ownDraft = a.authorId === viewer.id;
      if (ownDraft && !t.confirmOwn) {
        throw new EditorialError(
          'invalid',
          'You are publishing your own draft. Confirm to continue.',
        );
      }
      await assertCompiles(a.bodyMdx);
      await tx
        .update(articles)
        .set({
          status: 'published',
          editorId: viewer.id,
          publishedAt: new Date(),
          reviewNote: null,
        })
        .where(eq(articles.id, id));
      await audit(tx, {
        actorId: viewer.id,
        action: 'article.published',
        targetType: 'article',
        targetId: id,
        metadata: { selfReviewed: ownDraft, slug: a.slug },
      });
      return { id, status: 'published' as const };
    }
    if (a.status === 'published')
      throw new EditorialError('conflict', 'This article is already published.');
    await tx
      .update(articles)
      .set({ status: 'rejected', reviewNote: t.note })
      .where(eq(articles.id, id));
    await audit(tx, {
      actorId: viewer.id,
      action: 'article.rejected',
      targetType: 'article',
      targetId: id,
      metadata: { note: t.note },
    });
    return { id, status: 'rejected' as const };
  });
}

async function assertCompiles(body: string) {
  if (!body.trim()) throw new EditorialError('invalid', 'The body is empty.');
  const check = await checkMdx(body);
  if (!check.ok) throw new EditorialError('invalid', `The body does not compile: ${check.error}`);
}

export async function articleCounts(viewer: Viewer) {
  return asViewer(viewer, async (tx) => {
    const [row] = await tx
      .select({
        inReview: sql<number>`count(*) filter (where ${articles.status} = 'in_review')`.mapWith(
          Number,
        ),
        drafts:
          sql<number>`count(*) filter (where ${articles.status} in ('draft', 'rejected'))`.mapWith(
            Number,
          ),
        publishedThisWeek:
          sql<number>`count(*) filter (where ${articles.status} = 'published' and ${articles.publishedAt} > now() - interval '7 days')`.mapWith(
            Number,
          ),
      })
      .from(articles)
      .where(isNull(articles.deletedAt));
    return row ?? { inReview: 0, drafts: 0, publishedThisWeek: 0 };
  });
}
