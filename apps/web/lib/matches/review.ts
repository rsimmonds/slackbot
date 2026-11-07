import 'server-only';
import {
  adminDb,
  audit,
  auditLog,
  candidateProfiles,
  companies,
  decryptField,
  mandates,
  matches,
  profileOutcomes,
  users,
} from '@cmobeat/db';
import { matchApprovedEmail, sendEmail } from '@cmobeat/email';
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { proposeMatchesForMandate } from '@/lib/matching';
import {
  MatchError,
  notify,
  rationaleDiff,
  rationaleSchema,
  readRationale,
  requireTalent,
  toPercent,
  type Rationale,
} from './shared';

export const noteAad = (matchId: string) => `matches.candidate_note:${matchId}`;

// ---------------------------------------------------------------- queue

export interface QueueMatch {
  id: string;
  status: 'proposed' | 'approved' | 'rejected' | 'revealed';
  scoreLow: number;
  scoreHigh: number;
  summary: string;
  candidateResponse: string;
  createdAt: Date;
}

export interface QueueGroup {
  mandate: { id: string; title: string; companyName: string; confirmed: boolean };
  matches: QueueMatch[];
  proposed: number;
}

const statusOrder = sql`case ${matches.status} when 'proposed' then 0 when 'approved' then 1 when 'revealed' then 2 else 3 end`;

/** Matches grouped by mandate, groups with proposals first. Talent partners and admins only. */
export async function reviewQueue(viewer: Viewer | null): Promise<QueueGroup[]> {
  const v = requireTalent(viewer);
  const rows = await asViewer(v, (tx) =>
    tx
      .select({
        id: matches.id,
        status: matches.status,
        scoreLow: matches.scoreLow,
        scoreHigh: matches.scoreHigh,
        rationale: matches.rationale,
        candidateResponse: matches.candidateResponse,
        createdAt: matches.createdAt,
        mandateId: mandates.id,
        mandateTitle: mandates.title,
        confirmedAt: mandates.confirmedAt,
        companyName: companies.name,
      })
      .from(matches)
      .innerJoin(mandates, eq(mandates.id, matches.mandateId))
      .innerJoin(companies, eq(companies.id, mandates.companyId))
      .orderBy(statusOrder, desc(matches.scoreHigh), asc(matches.createdAt))
      .limit(500),
  );
  const groups = new Map<string, QueueGroup>();
  for (const r of rows) {
    const g =
      groups.get(r.mandateId) ??
      groups
        .set(r.mandateId, {
          mandate: {
            id: r.mandateId,
            title: r.mandateTitle,
            companyName: r.companyName,
            confirmed: !!r.confirmedAt,
          },
          matches: [],
          proposed: 0,
        })
        .get(r.mandateId)!;
    g.matches.push({
      id: r.id,
      status: r.status,
      scoreLow: toPercent(r.scoreLow),
      scoreHigh: toPercent(r.scoreHigh),
      summary: readRationale(r.rationale).summary,
      candidateResponse: r.candidateResponse,
      createdAt: r.createdAt,
    });
    if (r.status === 'proposed') g.proposed++;
  }
  return [...groups.values()].sort((a, b) => b.proposed - a.proposed);
}

/** Confirmed mandates a talent partner can run matching for. */
export async function matchableMandates(viewer: Viewer | null) {
  const v = requireTalent(viewer);
  return asViewer(v, (tx) =>
    tx
      .select({
        id: mandates.id,
        title: mandates.title,
        companyName: companies.name,
        confirmedAt: mandates.confirmedAt,
        matchCount: sql<number>`(select count(*)::int from ${matches} m where m.mandate_id = ${mandates.id})`,
      })
      .from(mandates)
      .innerJoin(companies, eq(companies.id, mandates.companyId))
      .where(and(isNotNull(mandates.confirmedAt), isNull(mandates.deletedAt)))
      .orderBy(desc(mandates.confirmedAt))
      .limit(50),
  );
}

/** Ask the Matcher for proposals. Proposals are never approved by this step. */
export async function runMatching(viewer: Viewer | null, mandateId: string) {
  const v = requireTalent(viewer);
  const [m] = await asViewer(v, (tx) =>
    tx
      .select({ id: mandates.id, confirmedAt: mandates.confirmedAt })
      .from(mandates)
      .where(eq(mandates.id, mandateId))
      .limit(1),
  );
  if (!m) throw new MatchError('Mandate not found.', 404);
  if (!m.confirmedAt) throw new MatchError('The employer has not confirmed this mandate yet.', 409);
  try {
    return await proposeMatchesForMandate(mandateId, { actorId: v.id });
  } catch (e) {
    if (e instanceof MatchError) throw e;
    console.error('matching failed', e);
    throw new MatchError(
      'Matching is not available right now. Nothing was changed. Try again shortly.',
      503,
    );
  }
}

// ---------------------------------------------------------------- dossier

export interface Dossier {
  match: {
    id: string;
    status: QueueMatch['status'];
    scoreLow: number;
    scoreHigh: number;
    rationale: Rationale;
    reviewedAt: Date | null;
    reviewedByMe: boolean;
    candidateResponse: string;
    candidateNote: string | null;
    candidateRespondedAt: Date | null;
  };
  mandate: {
    id: string;
    title: string;
    companyName: string;
    level: string;
    scope: string | null;
    reportingLine: string | null;
    teamSize: number | null;
    priorities: string[];
    workType: string;
    compMin: number | null;
    compMax: number | null;
    currency: string;
    compBasis: string;
    market: string;
  };
  /** Anonymised: no name, contact details or employer names. */
  profile: {
    level: string | null;
    yearsExperience: number | null;
    headline: string | null;
    outcomes: { metric: string; value: string; context: string | null; type: string }[];
    teamBuilds: string[];
    aiFluency: string | null;
    idealMandate: Record<string, unknown> | null;
  } | null;
  trail: {
    action: string;
    at: Date;
    actor: 'you' | 'staff' | 'candidate' | 'employer' | 'system';
    metadata: Record<string, unknown>;
  }[];
}

type TrailActor = Dossier['trail'][number]['actor'];

/** Who acted, by role, never by name: candidate and employer identities stay private here. */
function actorRole(
  action: string,
  actorId: string | null,
  metadata: Record<string, unknown>,
): TrailActor {
  if (!actorId) return 'system';
  if (
    action.startsWith('match.respond') ||
    action === 'reveal.consent' ||
    action === 'reveal.decline' ||
    action === 'reveal.withdraw'
  )
    return 'candidate';
  if (action === 'reveal.request') return 'employer';
  if (action === 'message.send') return metadata.side === 'employer' ? 'employer' : 'candidate';
  return 'staff';
}

export async function getDossier(viewer: Viewer | null, matchId: string): Promise<Dossier> {
  const v = requireTalent(viewer);
  return asViewer(v, async (tx) => {
    const [row] = await tx
      .select({ m: matches, md: mandates, companyName: companies.name })
      .from(matches)
      .innerJoin(mandates, eq(mandates.id, matches.mandateId))
      .innerJoin(companies, eq(companies.id, mandates.companyId))
      .where(eq(matches.id, matchId))
      .limit(1);
    if (!row) throw new MatchError('Match not found.', 404);
    const { m, md } = row;

    // RLS: talent partners see only anonymous or open profiles, never hidden ones.
    const [p] = await tx
      .select({
        id: candidateProfiles.id,
        userId: candidateProfiles.userId,
        level: candidateProfiles.level,
        yearsExperience: candidateProfiles.yearsExperience,
        headline: candidateProfiles.headline,
        idealMandate: candidateProfiles.idealMandate,
      })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, m.profileId))
      .limit(1);
    const outcomes = p
      ? await tx
          .select({
            type: profileOutcomes.outcomeType,
            metric: profileOutcomes.metric,
            value: profileOutcomes.value,
            context: profileOutcomes.context,
          })
          .from(profileOutcomes)
          .where(
            and(
              eq(profileOutcomes.profileId, p.id),
              isNotNull(profileOutcomes.candidateApprovedAt),
            ),
          )
          .orderBy(asc(profileOutcomes.createdAt))
      : [];

    const trailRows = await tx
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetType, 'match'), eq(auditLog.targetId, matchId)))
      .orderBy(asc(auditLog.at));

    const note = m.candidateNote
      ? await decryptField(m.candidateNote, { aad: noteAad(m.id) }).catch(() => null)
      : null;

    return {
      match: {
        id: m.id,
        status: m.status,
        scoreLow: toPercent(m.scoreLow),
        scoreHigh: toPercent(m.scoreHigh),
        rationale: readRationale(m.rationale),
        reviewedAt: m.reviewedAt,
        reviewedByMe: m.reviewedBy === v.id,
        candidateResponse: m.candidateResponse,
        candidateNote: note,
        candidateRespondedAt: m.candidateRespondedAt,
      },
      mandate: {
        id: md.id,
        title: md.title,
        companyName: row.companyName,
        level: md.level,
        scope: md.scope,
        reportingLine: md.reportingLine,
        teamSize: md.teamSize,
        priorities: md.priorities,
        workType: md.workType,
        compMin: md.compMin,
        compMax: md.compMax,
        currency: md.currency,
        compBasis: md.compBasis,
        market: md.market,
      },
      profile: p
        ? {
            level: p.level,
            yearsExperience: p.yearsExperience,
            headline: p.headline,
            outcomes: outcomes.filter((o) => o.type !== 'team' && o.type !== 'ai_fluency'),
            teamBuilds: outcomes.filter((o) => o.type === 'team').map((o) => o.value),
            aiFluency: outcomes.find((o) => o.type === 'ai_fluency')?.value ?? null,
            idealMandate: p.idealMandate,
          }
        : null,
      trail: trailRows.map((t) => ({
        action: t.action,
        at: t.at,
        actor: t.actorId === v.id ? 'you' : actorRole(t.action, t.actorId, t.metadata),
        metadata: t.metadata,
      })),
    };
  });
}

// ---------------------------------------------------------------- decisions

export const reviewInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), rationale: rationaleSchema.optional() }),
  z.object({ action: z.literal('reject'), note: z.string().trim().min(3).max(600) }),
]);
export type ReviewInput = z.infer<typeof reviewInput>;

/**
 * A talent partner approves (optionally after editing the rationale) or rejects a proposal.
 * The database checks the reviewer acts in their own name; the trigger blocks anyone else.
 */
export async function reviewMatch(viewer: Viewer | null, matchId: string, raw: unknown) {
  const v = requireTalent(viewer);
  const input = reviewInput.parse(raw);
  const result = await asViewer(v, async (tx) => {
    const [m] = await tx.select().from(matches).where(eq(matches.id, matchId)).limit(1);
    if (!m) throw new MatchError('Match not found.', 404);
    if (m.status !== 'proposed') throw new MatchError('This match has already been reviewed.', 409);
    const now = new Date();
    if (input.action === 'reject') {
      await tx
        .update(matches)
        .set({ status: 'rejected', reviewedBy: v.id, reviewedAt: now, updatedAt: now })
        .where(eq(matches.id, matchId));
      await audit(tx, {
        actorId: v.id,
        action: 'match.reject',
        targetType: 'match',
        targetId: matchId,
        metadata: { note: input.note },
      });
      return { status: 'rejected' as const, profileId: m.profileId };
    }
    const before = readRationale(m.rationale);
    const after = input.rationale ?? before;
    if (!after.summary) throw new MatchError('Add a short summary of why this fits.', 422);
    const diff = rationaleDiff(before, after);
    await tx
      .update(matches)
      .set({
        status: 'approved',
        rationale: after,
        reviewedBy: v.id,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(matches.id, matchId));
    if (Object.keys(diff).length)
      await audit(tx, {
        actorId: v.id,
        action: 'match.rationale_edit',
        targetType: 'match',
        targetId: matchId,
        metadata: { diff },
      });
    await audit(tx, {
      actorId: v.id,
      action: 'match.approve',
      targetType: 'match',
      targetId: matchId,
      metadata: { edited: Object.keys(diff).length > 0 },
    });
    return { status: 'approved' as const, profileId: m.profileId };
  });
  if (result.status === 'approved') {
    // System lookup of the recipient only; the reviewer never sees the candidate's address.
    await notify(async () => {
      const [u] = await adminDb()
        .select({ email: users.email })
        .from(candidateProfiles)
        .innerJoin(users, eq(users.id, candidateProfiles.userId))
        .where(and(eq(candidateProfiles.id, result.profileId), isNull(users.deletedAt)))
        .limit(1);
      if (u) await sendEmail(await matchApprovedEmail(u.email));
    });
  }
  return { id: matchId, status: result.status };
}

/** Counts for the console overview. */
export async function proposedCount(viewer: Viewer): Promise<number> {
  const [r] = await asViewer(viewer, (tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(matches)
      .where(inArray(matches.status, ['proposed'])),
  );
  return r?.n ?? 0;
}
