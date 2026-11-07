import 'server-only';
import {
  adminDb,
  audit,
  candidateProfiles,
  mandates,
  matches,
  revealRequests,
  users,
} from '@cmobeat/db';
import { introductionRequestedEmail, sendEmail } from '@cmobeat/email';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import {
  isPgError,
  MatchError,
  notify,
  readRationale,
  requireRole,
  toPercent,
  type Rationale,
} from './shared';

/** One row of the employer's shortlist, straight from employer_match_view. */
export interface ShortlistItem {
  matchId: string;
  status: 'approved' | 'revealed';
  scoreLow: number;
  scoreHigh: number;
  rationale: Rationale;
  reviewedAt: Date | null;
  level: string | null;
  yearsExperience: number | null;
  identityRevealed: boolean;
  /** Present only after the candidate consented. */
  candidate: { name: string; email: string; headline: string | null } | null;
  request: { id: string; decision: 'pending' | 'accepted' | 'declined'; at: Date } | null;
}

interface ViewRow extends Record<string, unknown> {
  match_id: string;
  status: 'approved' | 'revealed';
  score_low: number;
  score_high: number;
  rationale: unknown;
  reviewed_at: string | Date | null;
  level: string | null;
  years_experience: number | null;
  identity_revealed: boolean;
  headline: string | null;
  candidate_name: string | null;
  candidate_email: string | null;
}

/** The employer's own mandate, or 404. RLS limits mandates to the employer's company. */
export async function employerMandate(viewer: Viewer | null, mandateId: string) {
  const v = requireRole(viewer, 'employer');
  const [m] = await asViewer(v, (tx) =>
    tx
      .select({
        id: mandates.id,
        title: mandates.title,
        companyId: mandates.companyId,
        confirmedAt: mandates.confirmedAt,
        reportingLine: mandates.reportingLine,
        teamSize: mandates.teamSize,
        priorities: mandates.priorities,
        compMin: mandates.compMin,
        compMax: mandates.compMax,
        currency: mandates.currency,
        compBasis: mandates.compBasis,
      })
      .from(mandates)
      .where(and(eq(mandates.id, mandateId), isNull(mandates.deletedAt)))
      .limit(1),
  );
  if (!m) throw new MatchError('Mandate not found.', 404);
  return m;
}

/**
 * Approved matches for one mandate, anonymised until each candidate consents. Hidden profiles,
 * blocklisted companies and unreviewed proposals never appear: the view filters them.
 */
export async function shortlist(
  viewer: Viewer | null,
  mandateId: string,
): Promise<ShortlistItem[]> {
  const v = requireRole(viewer, 'employer');
  await employerMandate(v, mandateId);
  return asViewer(v, async (tx) => {
    const rows = [
      ...(await tx.execute<ViewRow>(
        sql`select * from employer_match_view where mandate_id = ${mandateId}
            order by score_high desc, match_id`,
      )),
    ];
    const ids = rows.map((r) => r.match_id);
    const requests = ids.length
      ? await tx
          .select({
            id: revealRequests.id,
            matchId: revealRequests.matchId,
            decision: revealRequests.candidateDecision,
            createdAt: revealRequests.createdAt,
          })
          .from(revealRequests)
          .where(inArray(revealRequests.matchId, ids))
          .orderBy(desc(revealRequests.createdAt))
      : [];
    return rows.map((r) => {
      const req = requests.find((q) => q.matchId === r.match_id);
      return {
        matchId: r.match_id,
        status: r.status,
        scoreLow: toPercent(r.score_low),
        scoreHigh: toPercent(r.score_high),
        rationale: readRationale(r.rationale),
        reviewedAt: r.reviewed_at ? new Date(r.reviewed_at) : null,
        level: r.level,
        yearsExperience: r.years_experience,
        identityRevealed: r.identity_revealed,
        candidate:
          r.identity_revealed && r.candidate_name && r.candidate_email
            ? { name: r.candidate_name, email: r.candidate_email, headline: r.headline }
            : null,
        request: req ? { id: req.id, decision: req.decision, at: req.createdAt } : null,
      };
    });
  });
}

/**
 * Ask to be introduced. The database only accepts it for an approved match the employer can
 * see (never hidden, never blocklisted). The candidate decides; nothing is shared until then.
 */
export async function requestIntroduction(viewer: Viewer | null, matchId: string) {
  const v = requireRole(viewer, 'employer');
  const created = await asViewer(v, async (tx) => {
    const [visible] = [
      ...(await tx.execute<{ match_id: string; status: string }>(
        sql`select match_id, status from employer_match_view where match_id = ${matchId}`,
      )),
    ];
    if (!visible) throw new MatchError('Match not found.', 404);
    if (visible.status !== 'approved')
      throw new MatchError('This candidate has already been introduced.', 409);
    const [open] = await tx
      .select({ id: revealRequests.id, decision: revealRequests.candidateDecision })
      .from(revealRequests)
      .where(
        and(eq(revealRequests.matchId, matchId), eq(revealRequests.candidateDecision, 'pending')),
      )
      .limit(1);
    if (open) throw new MatchError('You have already asked. The candidate will decide.', 409);
    try {
      const [row] = await tx
        .insert(revealRequests)
        .values({ matchId, requestedBy: v.id })
        .returning({ id: revealRequests.id });
      await audit(tx, {
        actorId: v.id,
        action: 'reveal.request',
        targetType: 'match',
        targetId: matchId,
        metadata: { revealRequestId: row!.id },
      });
      return row!;
    } catch (e) {
      if (isPgError(e, '42501')) throw new MatchError('Match not found.', 404);
      throw e;
    }
  });
  await notify(async () => {
    const [u] = await adminDb()
      .select({ email: users.email })
      .from(matches)
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, matches.profileId))
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .where(and(eq(matches.id, matchId), isNull(users.deletedAt)))
      .limit(1);
    if (u) await sendEmail(await introductionRequestedEmail(u.email));
  });
  return { id: created.id, matchId };
}
