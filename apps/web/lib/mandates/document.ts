import 'server-only';
import { MandateDocumentSchema, type MandateDocument } from '@cmobeat/ai/schemas';
import type { SessionRecord } from '@cmobeat/ai/interview';
import { audit, companies, interviewSessions, mandates, type Tx } from '@cmobeat/db';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { onMandateConfirmed } from '@/lib/matching/triggers';
import { SessionError } from '@cmobeat/ai/interview';
import { computeBenchmark, type CompBenchmark } from './benchmark';

/** Narrative fields stored in mandates.document (the rest map to mandate columns). */
export interface MandateNarrative {
  summary: string;
  tensions: string[];
  nonNegotiables: string[];
  risks: string[];
  /** Output fields the system suggested rather than read from the answers. */
  derived: string[];
  /** Fields still missing when the session ended. */
  missing: string[];
  sessionRef: string | null;
}

export interface MandateRecord {
  id: string;
  companyId: string;
  companyName: string;
  source: 'builder' | 'listing';
  confirmedAt: Date | null;
  updatedAt: Date;
  doc: MandateDocument;
  narrative: MandateNarrative;
  benchmark: CompBenchmark | null;
}

type Row = typeof mandates.$inferSelect;

const arr = (v: unknown) => (Array.isArray(v) ? v : []);

/** Row → document. Old listing mandates without a document still render. */
export function toDocument(row: Row): { doc: MandateDocument; narrative: MandateNarrative } {
  const n = (row.document ?? {}) as Partial<MandateNarrative>;
  const doc: MandateDocument = {
    title: row.title,
    level: row.level,
    workType: row.workType,
    market: row.market,
    currency: row.currency,
    reportingLine: row.reportingLine ?? '',
    teamSize: row.teamSize,
    summary: n.summary ?? row.scope ?? '',
    priorities: row.priorities ?? [],
    tensions: arr(n.tensions),
    nonNegotiables: arr(n.nonNegotiables),
    risks: arr(n.risks),
    scorecard: arr((row.scorecard as { items?: unknown }).items) as MandateDocument['scorecard'],
    interviewPlan: arr(
      (row.interviewPlan as { stages?: unknown }).stages,
    ) as MandateDocument['interviewPlan'],
    compMin: row.compMin,
    compMax: row.compMax,
    compBasis: row.compBasis,
  };
  return {
    doc,
    narrative: {
      summary: doc.summary,
      tensions: doc.tensions,
      nonNegotiables: doc.nonNegotiables,
      risks: doc.risks,
      derived: arr(n.derived) as string[],
      missing: arr(n.missing) as string[],
      sessionRef: n.sessionRef ?? null,
    },
  };
}

/** Document → mandate columns. */
export function toColumns(
  doc: MandateDocument,
  narrative: Omit<MandateNarrative, 'summary' | 'tensions' | 'nonNegotiables' | 'risks'>,
) {
  return {
    title: doc.title,
    level: doc.level,
    workType: doc.workType,
    market: doc.market,
    currency: doc.currency,
    reportingLine: doc.reportingLine || null,
    teamSize: doc.teamSize,
    scope: doc.summary.slice(0, 600),
    priorities: doc.priorities,
    scorecard: { items: doc.scorecard },
    interviewPlan: { stages: doc.interviewPlan },
    compMin: doc.compMin,
    compMax: doc.compMax,
    compBasis: doc.workType === 'fractional' ? ('monthly_retainer' as const) : ('annual' as const),
    document: {
      summary: doc.summary,
      tensions: doc.tensions,
      nonNegotiables: doc.nonNegotiables,
      risks: doc.risks,
      derived: narrative.derived,
      missing: narrative.missing,
      sessionRef: narrative.sessionRef,
    },
  };
}

function toRecord(row: Row, companyName: string): MandateRecord {
  const { doc, narrative } = toDocument(row);
  return {
    id: row.id,
    companyId: row.companyId,
    companyName,
    source: row.source,
    confirmedAt: row.confirmedAt,
    updatedAt: row.updatedAt,
    doc,
    narrative,
    benchmark: (row.compBenchmark as CompBenchmark | null) ?? null,
  };
}

/** A mandate the viewer may read (their company's, or any for staff — RLS decides). */
export async function getMandate(viewer: Viewer, id: string): Promise<MandateRecord | null> {
  if (!z.uuid().safeParse(id).success) return null;
  return asViewer(viewer, async (tx) => {
    const [row] = await tx
      .select({ m: mandates, company: companies.name })
      .from(mandates)
      .innerJoin(companies, eq(companies.id, mandates.companyId))
      .where(and(eq(mandates.id, id), isNull(mandates.deletedAt)))
      .limit(1);
    return row ? toRecord(row.m, row.company) : null;
  });
}

export async function listBuilderMandates(viewer: Viewer, companyId: string) {
  return asViewer(viewer, async (tx) => {
    const rows = await tx
      .select()
      .from(mandates)
      .where(
        and(
          eq(mandates.companyId, companyId),
          eq(mandates.source, 'builder'),
          isNull(mandates.deletedAt),
        ),
      )
      .orderBy(desc(mandates.updatedAt));
    const sessions = await tx
      .select({
        id: interviewSessions.id,
        ref: interviewSessions.publicRef,
        questionIndex: interviewSessions.questionIndex,
        maxQuestions: interviewSessions.maxQuestions,
        updatedAt: interviewSessions.updatedAt,
      })
      .from(interviewSessions)
      .where(
        and(
          eq(interviewSessions.ownerId, viewer.id),
          eq(interviewSessions.kind, 'mandate'),
          eq(interviewSessions.status, 'active'),
        ),
      )
      .orderBy(desc(interviewSessions.updatedAt));
    return { mandates: rows.map((r) => toRecord(r, '')), sessions };
  });
}

async function benchmarkFor(doc: MandateDocument, excludeMandateId?: string) {
  return computeBenchmark({
    level: doc.level,
    market: doc.market,
    currency: doc.currency,
    basis: doc.workType === 'fractional' ? 'monthly_retainer' : 'annual',
    excludeMandateId,
  });
}

/**
 * Turn a finished mandate session into a mandate (unconfirmed). Re-completing updates the same
 * mandate. If required parts are missing, the mandate is still created so the employer can fill
 * them in; confirmation validates the whole document.
 */
export async function createFromSession(
  tx: Tx,
  viewer: Viewer,
  rec: SessionRecord,
  doc: MandateDocument,
  meta: { derived: string[]; missing: string[]; ref: string },
): Promise<string> {
  if (!rec.companyId) throw new SessionError('This session is not linked to a company.', 409);
  const benchmark = await benchmarkFor(doc, rec.mandateId ?? undefined);
  const values = {
    ...toColumns(doc, { derived: meta.derived, missing: meta.missing, sessionRef: meta.ref }),
    compBenchmark: benchmark as unknown as Record<string, unknown>,
    confirmedAt: null,
    updatedAt: new Date(),
  };
  let mandateId = rec.mandateId;
  if (mandateId) {
    await tx.update(mandates).set(values).where(eq(mandates.id, mandateId));
  } else {
    const [row] = await tx
      .insert(mandates)
      .values({ ...values, companyId: rec.companyId, source: 'builder' })
      .returning({ id: mandates.id });
    mandateId = row!.id;
  }
  await tx
    .update(interviewSessions)
    .set({ status: 'complete', completedAt: new Date(), mandateId, updatedAt: new Date() })
    .where(eq(interviewSessions.id, rec.id));
  await audit(tx, {
    actorId: viewer.id,
    action: 'mandate.session_completed',
    targetType: 'mandate',
    targetId: mandateId,
    metadata: { sessionId: rec.id, derived: meta.derived, missing: meta.missing },
  });
  return mandateId;
}

// ------------------------------------------------------------------ edit and confirm

const lines = z
  .string()
  .max(6000)
  .transform((s) =>
    s
      .split('\n')
      .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
      .filter(Boolean),
  );

/** The editable form. Lists are one item per line; scorecard and plan rows are structured. */
export const editInput = z.object({
  title: z.string().trim().min(2).max(120),
  level: MandateDocumentSchema.shape.level,
  workType: MandateDocumentSchema.shape.workType,
  market: MandateDocumentSchema.shape.market,
  currency: MandateDocumentSchema.shape.currency,
  reportingLine: z.string().trim().max(120),
  teamSize: z
    .union([z.literal(''), z.coerce.number().int().min(0).max(100_000)])
    .transform((v) => (v === '' ? null : v)),
  summary: z.string().trim().max(2000),
  priorities: lines,
  tensions: lines,
  nonNegotiables: lines,
  risks: lines,
  scorecard: z
    .array(
      z.object({
        outcome: z.string().trim().max(200),
        measure: z.string().trim().max(200),
        byDay: z.coerce.number().pipe(z.union([z.literal(30), z.literal(60), z.literal(90)])),
      }),
    )
    .max(8)
    .transform((rows) => rows.filter((r) => r.outcome)),
  interviewPlan: z
    .array(
      z.object({
        stage: z.string().trim().max(80),
        interviewer: z.string().trim().max(80),
        tests: lines,
      }),
    )
    .max(7)
    .transform((rows) => rows.filter((r) => r.interviewer)),
  compMin: z
    .union([z.literal(''), z.coerce.number().int().positive()])
    .transform((v) => (v === '' ? null : v)),
  compMax: z
    .union([z.literal(''), z.coerce.number().int().positive()])
    .transform((v) => (v === '' ? null : v)),
});
export type EditInput = z.infer<typeof editInput>;

export function toDoc(input: EditInput): MandateDocument {
  return {
    ...input,
    compBasis: input.workType === 'fractional' ? 'monthly_retainer' : 'annual',
    interviewPlan: input.interviewPlan.map((s, i) => ({
      ...s,
      stage: s.stage || `Stage ${i + 1}`,
    })),
  };
}

/** Plain-language problems that block confirmation (empty = confirmable). */
export function confirmProblems(doc: MandateDocument): string[] {
  const problems: string[] = [];
  const parsed = MandateDocumentSchema.safeParse(doc);
  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((i) => String(i.path[0])));
    const label: Record<string, string> = {
      summary: 'Write a short summary of why you are hiring now (20 characters or more).',
      priorities: 'List at least three priorities for the first twelve months.',
      scorecard: 'Add at least three scorecard outcomes, each with a measure.',
      interviewPlan: 'Add at least three interview stages.',
      reportingLine: 'Say who the role reports to.',
      title: 'Add a title.',
    };
    for (const f of fields) problems.push(label[f] ?? `Check ${f}.`);
  }
  if (doc.compMin === null || doc.compMax === null)
    problems.push(
      'Add a compensation range. It is required before this mandate can be posted or searched.',
    );
  else if (doc.compMin > doc.compMax)
    problems.push('The low end of the range is above the high end.');
  return problems;
}

/** Save edits. Any edit clears a previous confirmation: a person confirms the final text. */
export async function saveMandate(viewer: Viewer, id: string, input: EditInput) {
  const existing = await getMandate(viewer, id);
  if (!existing) throw new SessionError('Mandate not found.', 404);
  const doc = toDoc(input);
  if (doc.compMin !== null && doc.compMax !== null && doc.compMin > doc.compMax)
    throw new SessionError('The low end of the range is above the high end.', 400);
  const benchmark = await benchmarkFor(doc, id);
  await asViewer(viewer, async (tx) => {
    const updated = await tx
      .update(mandates)
      .set({
        ...toColumns(doc, {
          derived: existing.narrative.derived.filter((f) => !(f in input)),
          missing: [],
          sessionRef: existing.narrative.sessionRef,
        }),
        compBenchmark: benchmark as unknown as Record<string, unknown>,
        confirmedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(mandates.id, id))
      .returning({ id: mandates.id });
    if (!updated.length) throw new SessionError('You cannot edit this mandate.', 403);
    await audit(tx, {
      actorId: viewer.id,
      action: 'mandate.edited',
      targetType: 'mandate',
      targetId: id,
    });
  });
}

/** The employer's sign-off (amber). Requires a complete, valid document with a comp range. */
export async function confirmMandate(viewer: Viewer, id: string) {
  const existing = await getMandate(viewer, id);
  if (!existing) throw new SessionError('Mandate not found.', 404);
  const problems = confirmProblems(existing.doc);
  if (problems.length) throw new SessionError(problems.join(' '), 422);
  await asViewer(viewer, async (tx) => {
    const updated = await tx
      .update(mandates)
      .set({ confirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(mandates.id, id))
      .returning({ id: mandates.id });
    if (!updated.length) throw new SessionError('You cannot confirm this mandate.', 403);
    await audit(tx, {
      actorId: viewer.id,
      action: 'mandate.confirmed',
      targetType: 'mandate',
      targetId: id,
    });
  });
  // After commit: queue matching (proposals only; a talent partner reviews every one).
  await onMandateConfirmed(id);
}
