import { audit, companies, moves, sourceItems, type Tx } from '@cmobeat/db';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { asViewer } from '../db';
import type { Viewer } from '../auth';
import { EditorialError, requireEditorial } from './access';

export const moveTypes = ['appointed', 'departed', 'promoted'] as const;
export type MoveType = (typeof moveTypes)[number];

export const sourceSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  label: z.string().trim().min(1).max(200),
  kind: z.enum(['newsroom', 'wire', 'edgar', 'submission']),
});

/** What an editor can change on a draft move. */
export const moveEditSchema = z.object({
  personName: z.string().trim().min(2).max(120),
  companyId: z.uuid(),
  moveType: z.enum(moveTypes),
  title: z.string().trim().min(2).max(160),
  previousRole: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => v || null),
  effectiveDate: z.iso.date(),
  summary: z
    .string()
    .trim()
    .max(1200)
    .nullish()
    .transform((v) => v || null),
  sources: z.array(sourceSchema).min(1, 'At least one public source is required.').max(12),
});
export type MoveEdit = z.infer<typeof moveEditSchema>;

export const moveFiltersSchema = z.object({
  type: z.enum(moveTypes).optional(),
  company: z.string().trim().max(120).optional(),
  q: z.string().trim().max(120).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  status: z.enum(['draft', 'approved', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type MoveFilters = z.infer<typeof moveFiltersSchema>;

const moveColumns = {
  id: moves.id,
  personName: moves.personName,
  companyId: moves.companyId,
  companyName: companies.name,
  industry: companies.industry,
  moveType: moves.moveType,
  title: moves.title,
  previousRole: moves.previousRole,
  effectiveDate: moves.effectiveDate,
  summary: moves.summary,
  sources: moves.sources,
  confidence: moves.confidence,
  status: moves.status,
  agentRunId: moves.agentRunId,
  reviewNote: moves.reviewNote,
  approvedAt: moves.approvedAt,
  createdAt: moves.createdAt,
  updatedAt: moves.updatedAt,
};

export type MoveRow = Awaited<ReturnType<typeof getMove>>;

/**
 * Public list. Anyone sees approved moves; only editors may ask for other statuses
 * (RLS enforces this too, so a forged status filter returns nothing).
 */
export async function listMoves(viewer: Viewer | null, filters: MoveFilters) {
  const status = filters.status ?? 'approved';
  return asViewer(viewer, (tx) => {
    const where = [eq(moves.status, status)];
    if (filters.type) where.push(eq(moves.moveType, filters.type));
    if (filters.company) where.push(ilike(companies.name, `%${escapeLike(filters.company)}%`));
    if (filters.q) {
      const q = `%${escapeLike(filters.q)}%`;
      where.push(or(ilike(moves.personName, q), ilike(moves.title, q), ilike(companies.name, q))!);
    }
    if (filters.from) where.push(gte(moves.effectiveDate, filters.from));
    if (filters.to) where.push(lte(moves.effectiveDate, filters.to));
    return tx
      .select(moveColumns)
      .from(moves)
      .innerJoin(companies, eq(companies.id, moves.companyId))
      .where(and(...where))
      .orderBy(desc(moves.effectiveDate), desc(moves.createdAt))
      .limit(filters.limit)
      .offset(filters.offset);
  });
}

export async function getMove(tx: Tx, id: string) {
  const [row] = await tx
    .select(moveColumns)
    .from(moves)
    .innerJoin(companies, eq(companies.id, moves.companyId))
    .where(eq(moves.id, id))
    .limit(1);
  return row ?? null;
}

/** The editorial queue: drafts first-in, first-out, with the public items they came from. */
export async function listMoveDrafts(viewer: Viewer) {
  requireEditorial(viewer);
  return asViewer(viewer, (tx) =>
    tx
      .select(moveColumns)
      .from(moves)
      .innerJoin(companies, eq(companies.id, moves.companyId))
      .where(eq(moves.status, 'draft'))
      .orderBy(asc(moves.createdAt)),
  );
}

/** Everything the review screen needs: the draft, its source items, and the company list. */
export async function getMoveForReview(viewer: Viewer, id: string) {
  requireEditorial(viewer);
  return asViewer(viewer, async (tx) => {
    const move = await getMove(tx, id);
    if (!move) return null;
    const urls = move.sources.map((s) => s.url);
    const items = await tx
      .select({
        id: sourceItems.id,
        url: sourceItems.url,
        title: sourceItems.title,
        publisher: sourceItems.publisher,
        excerpt: sourceItems.excerpt,
        kind: sourceItems.kind,
        publishedAt: sourceItems.publishedAt,
      })
      .from(sourceItems)
      .where(
        urls.length
          ? or(eq(sourceItems.moveId, id), inArray(sourceItems.url, urls))
          : eq(sourceItems.moveId, id),
      );
    const companyOptions = await tx
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .orderBy(asc(companies.name));
    return { move, sourceItems: items, companies: companyOptions };
  });
}

const editableKeys = [
  'personName',
  'companyId',
  'moveType',
  'title',
  'previousRole',
  'effectiveDate',
  'summary',
  'sources',
] as const;

/** Field-level diff for the audit log: only the fields that changed, before and after. */
export function diffMove(before: NonNullable<MoveRow>, after: MoveEdit) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of editableKeys) {
    const a = before[k] ?? null;
    const b = after[k] ?? null;
    if (stableStringify(a) !== stableStringify(b)) changes[k] = { from: a, to: b };
  }
  return changes;
}

async function loadDraft(tx: Tx, id: string) {
  const move = await getMove(tx, id);
  if (!move) throw new EditorialError('not_found', 'That move does not exist.');
  return move;
}

async function applyEdit(tx: Tx, viewer: Viewer, id: string, edit: MoveEdit) {
  const before = await loadDraft(tx, id);
  if (before.status === 'approved')
    throw new EditorialError('conflict', 'This move is already published.');
  const changes = diffMove(before, edit);
  if (Object.keys(changes).length) {
    await tx.update(moves).set(edit).where(eq(moves.id, id));
    await audit(tx, {
      actorId: viewer.id,
      action: 'move.edited',
      targetType: 'move',
      targetId: id,
      metadata: { changes },
    });
  }
  return changes;
}

export async function saveMove(viewer: Viewer, id: string, input: unknown) {
  requireEditorial(viewer);
  const edit = moveEditSchema.parse(input);
  return asViewer(viewer, (tx) => applyEdit(tx, viewer, id, edit));
}

/** Approve and publish. Optional edits are saved first, in the same transaction. */
export async function approveMove(viewer: Viewer, id: string, input?: unknown) {
  requireEditorial(viewer);
  const edit = input === undefined ? undefined : moveEditSchema.parse(input);
  return asViewer(viewer, async (tx) => {
    const changes = edit ? await applyEdit(tx, viewer, id, edit) : {};
    const before = await loadDraft(tx, id);
    if (before.status === 'approved')
      throw new EditorialError('conflict', 'This move is already published.');
    if (before.sources.length < 1)
      throw new EditorialError('invalid', 'At least one public source is required.');
    const updated = await tx
      .update(moves)
      .set({ status: 'approved', approvedBy: viewer.id, approvedAt: new Date(), reviewNote: null })
      .where(eq(moves.id, id))
      .returning({ id: moves.id });
    if (!updated.length) throw new EditorialError('forbidden', 'You cannot approve this move.');
    await audit(tx, {
      actorId: viewer.id,
      action: 'move.approved',
      targetType: 'move',
      targetId: id,
      metadata: {
        editedFields: Object.keys(changes),
        aiDrafted: !!before.agentRunId,
        sources: before.sources.length,
      },
    });
    return { id };
  });
}

export const rejectSchema = z.object({
  note: z.string().trim().min(3, 'Say why, briefly.').max(1000),
});

export async function rejectMove(viewer: Viewer, id: string, input: unknown) {
  requireEditorial(viewer);
  const { note } = rejectSchema.parse(input);
  return asViewer(viewer, async (tx) => {
    const before = await loadDraft(tx, id);
    if (before.status === 'approved')
      throw new EditorialError('conflict', 'This move is already published.');
    await tx.update(moves).set({ status: 'rejected', reviewNote: note }).where(eq(moves.id, id));
    await audit(tx, {
      actorId: viewer.id,
      action: 'move.rejected',
      targetType: 'move',
      targetId: id,
      metadata: { note, aiDrafted: !!before.agentRunId },
    });
    return { id };
  });
}

export async function moveCounts(viewer: Viewer) {
  return asViewer(viewer, async (tx) => {
    const [row] = await tx
      .select({
        drafts: sql<number>`count(*) filter (where ${moves.status} = 'draft')`.mapWith(Number),
        approvedThisWeek:
          sql<number>`count(*) filter (where ${moves.status} = 'approved' and ${moves.approvedAt} > now() - interval '7 days')`.mapWith(
            Number,
          ),
      })
      .from(moves);
    return row ?? { drafts: 0, approvedThisWeek: 0 };
  });
}

/** Qualitative confidence for AI drafts. Never shown as a lone number (spec 7.1.6). */
export function confidenceLabel(
  c: number | null | undefined,
): { label: string; range: string } | null {
  if (c === null || c === undefined) return null;
  const pct = Math.round(c * 100);
  const lo = Math.max(0, pct - 10);
  const hi = Math.min(100, pct + 10);
  const label = c >= 0.85 ? 'High confidence' : c >= 0.6 ? 'Moderate confidence' : 'Low confidence';
  return { label, range: `${lo}–${hi}` };
}

export function publicMove(m: NonNullable<MoveRow>) {
  return {
    id: m.id,
    personName: m.personName,
    company: { id: m.companyId, name: m.companyName, industry: m.industry },
    moveType: m.moveType,
    title: m.title,
    previousRole: m.previousRole,
    effectiveDate: m.effectiveDate,
    summary: m.summary,
    sources: m.sources,
    status: m.status,
    approvedAt: m.approvedAt,
  };
}

/** JSON with sorted object keys: jsonb does not preserve key order, so plain stringify misreports changes. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}
