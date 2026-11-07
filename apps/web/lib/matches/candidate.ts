import 'server-only';
import {
  adminDb,
  audit,
  consents,
  encryptField,
  matches,
  revealRequests,
  users,
  type Tx,
} from '@cmobeat/db';
import { revealDecisionEmail, sendEmail } from '@cmobeat/email';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { noteAad } from './review';
import {
  MatchError,
  notify,
  readRationale,
  requireRole,
  toPercent,
  type Rationale,
} from './shared';

export interface CandidateMatch {
  matchId: string;
  status: 'approved' | 'revealed';
  scoreLow: number;
  scoreHigh: number;
  rationale: Rationale;
  response: 'pending' | 'interested' | 'declined' | 'question';
  respondedAt: Date | null;
  role: {
    title: string;
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
    remote: boolean;
  };
  company: { industry: string; stage: string; sizeBand: string; name: string | null };
  pendingRequestId: string | null;
  /** True while a reveal consent for this match is live (identity visible to the employer). */
  revealedNow: boolean;
}

interface ViewRow extends Record<string, unknown> {
  match_id: string;
  status: 'approved' | 'revealed';
  score_low: number;
  score_high: number;
  rationale: unknown;
  candidate_response: CandidateMatch['response'];
  candidate_responded_at: string | Date | null;
  mandate_title: string;
  level: string;
  scope: string | null;
  reporting_line: string | null;
  team_size: number | null;
  priorities: string[];
  work_type: string;
  comp_min: number | null;
  comp_max: number | null;
  currency: string;
  comp_basis: string;
  market: string;
  remote: boolean;
  company_industry: string;
  company_stage: string;
  company_size_band: string;
  company_name: string | null;
  pending_reveal_request_id: string | null;
}

/** Exactly what an employer sees after a reveal (employer_match_view). Shown in the Consent Gate. */
export const revealFields = ['Full name', 'Email address', 'Headline'] as const;
export const recipientFor = (industry: string) => `The ${industry} company's hiring team`;

/** Approved matches for the signed-in candidate. The company stays unnamed until a reveal. */
export async function myMatches(viewer: Viewer | null): Promise<CandidateMatch[]> {
  const v = requireRole(viewer, 'candidate');
  return asViewer(v, async (tx) => {
    const rows = [
      ...(await tx.execute<ViewRow>(
        sql`select * from candidate_match_view order by reviewed_at desc nulls last, match_id`,
      )),
    ];
    const ids = rows.map((r) => r.match_id);
    const live = ids.length
      ? await tx
          .select({ matchId: revealRequests.matchId })
          .from(revealRequests)
          .innerJoin(consents, eq(consents.id, revealRequests.consentId))
          .where(
            and(
              inArray(revealRequests.matchId, ids),
              eq(revealRequests.candidateDecision, 'accepted'),
              isNull(consents.withdrawnAt),
            ),
          )
      : [];
    const liveIds = new Set(live.map((l) => l.matchId));
    return rows.map((r) => ({
      matchId: r.match_id,
      status: r.status,
      scoreLow: toPercent(r.score_low),
      scoreHigh: toPercent(r.score_high),
      rationale: readRationale(r.rationale),
      response: r.candidate_response,
      respondedAt: r.candidate_responded_at ? new Date(r.candidate_responded_at) : null,
      role: {
        title: r.mandate_title,
        level: r.level,
        scope: r.scope,
        reportingLine: r.reporting_line,
        teamSize: r.team_size,
        priorities: r.priorities ?? [],
        workType: r.work_type,
        compMin: r.comp_min,
        compMax: r.comp_max,
        currency: r.currency,
        compBasis: r.comp_basis,
        market: r.market,
        remote: r.remote,
      },
      company: {
        industry: r.company_industry,
        stage: r.company_stage,
        sizeBand: r.company_size_band,
        name: r.company_name,
      },
      pendingRequestId: r.pending_reveal_request_id,
      revealedNow: liveIds.has(r.match_id),
    }));
  });
}

async function ownMatch(v: Viewer, matchId: string): Promise<CandidateMatch> {
  const m = (await myMatches(v)).find((x) => x.matchId === matchId);
  if (!m) throw new MatchError('Match not found.', 404);
  return m;
}

// ---------------------------------------------------------------- respond

export const responseInput = z
  .object({
    response: z.enum(['interested', 'declined', 'question']),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((x) => x.response !== 'question' || (x.note && x.note.length >= 3), {
    message: 'Write your question for the talent partner.',
    path: ['note'],
  });

/**
 * The candidate answers an approved match. Only their own response columns change (the database
 * blocks anything else). A note is encrypted and read only by talent partners.
 */
export async function respondToMatch(viewer: Viewer | null, matchId: string, raw: unknown) {
  const v = requireRole(viewer, 'candidate');
  const input = responseInput.parse(raw);
  await ownMatch(v, matchId);
  return asViewer(v, async (tx) => {
    const note = input.note ? await encryptField(input.note, { aad: noteAad(matchId) }) : null;
    const updated = await tx
      .update(matches)
      .set({
        candidateResponse: input.response,
        candidateNote: note,
        candidateRespondedAt: new Date(),
      })
      .where(eq(matches.id, matchId))
      .returning({ id: matches.id });
    if (!updated.length) throw new MatchError('Match not found.', 404);
    await audit(tx, {
      actorId: v.id,
      action: 'match.respond',
      targetType: 'match',
      targetId: matchId,
      metadata: { response: input.response, withNote: !!input.note },
    });
    return { matchId, response: input.response };
  });
}

// ---------------------------------------------------------------- reveal

export const decisionInput = z.discriminatedUnion('accept', [
  /** Accepting needs the explicit acknowledgement from the Consent Gate. */
  z.object({ accept: z.literal(true), acknowledged: z.literal(true) }),
  z.object({ accept: z.literal(false) }),
]);

/**
 * The candidate decides on an introduction request. Accepting records a reveal consent listing
 * exactly who sees what; the database then marks the match revealed. Declining shares nothing.
 */
export async function decideReveal(viewer: Viewer | null, requestId: string, raw: unknown) {
  const v = requireRole(viewer, 'candidate');
  const input = decisionInput.parse(raw);
  const result = await asViewer(v, async (tx) => {
    const [req] = await tx
      .select()
      .from(revealRequests)
      .where(eq(revealRequests.id, requestId))
      .limit(1);
    if (!req) throw new MatchError('Request not found.', 404);
    if (req.candidateDecision !== 'pending')
      throw new MatchError('You have already answered this request.', 409);
    const m = await ownMatchTx(tx, req.matchId);
    const now = new Date();
    if (!input.accept) {
      await tx
        .update(revealRequests)
        .set({ candidateDecision: 'declined', decidedAt: now })
        .where(eq(revealRequests.id, requestId));
      await audit(tx, {
        actorId: v.id,
        action: 'reveal.decline',
        targetType: 'match',
        targetId: req.matchId,
        metadata: { revealRequestId: requestId },
      });
      return { accepted: false, matchId: req.matchId, requestedBy: req.requestedBy };
    }
    const disclosure = { recipient: recipientFor(m.company_industry), fields: [...revealFields] };
    const [consent] = await tx
      .insert(consents)
      .values({
        subjectUserId: v.id,
        kind: 'reveal',
        scope: { matchId: req.matchId, revealRequestId: requestId, disclosures: [disclosure] },
      })
      .returning({ id: consents.id });
    await tx
      .update(revealRequests)
      .set({ candidateDecision: 'accepted', consentId: consent!.id, decidedAt: now })
      .where(eq(revealRequests.id, requestId));
    await audit(tx, {
      actorId: v.id,
      action: 'reveal.consent',
      targetType: 'match',
      targetId: req.matchId,
      metadata: { revealRequestId: requestId, consentId: consent!.id, disclosure },
    });
    return { accepted: true, matchId: req.matchId, requestedBy: req.requestedBy };
  });
  await notify(async () => {
    const [row] = await adminDb()
      .select({ email: users.email, mandateId: matches.mandateId })
      .from(users)
      .innerJoin(matches, eq(matches.id, result.matchId))
      .where(and(eq(users.id, result.requestedBy), isNull(users.deletedAt)))
      .limit(1);
    if (row) await sendEmail(await revealDecisionEmail(row.email, result.accepted, row.mandateId));
  });
  return { matchId: result.matchId, accepted: result.accepted };
}

/** Read the candidate's own match row (view) inside an existing transaction. */
async function ownMatchTx(tx: Tx, matchId: string): Promise<ViewRow> {
  const [row] = [
    ...(await tx.execute<ViewRow>(
      sql`select * from candidate_match_view where match_id = ${matchId}`,
    )),
  ];
  if (!row) throw new MatchError('Match not found.', 404);
  return row;
}

/**
 * Withdraw a reveal. The employer's view hides the candidate's identity immediately; what they
 * already saw cannot be unseen, which the Consent Gate said up front.
 */
export async function withdrawReveal(viewer: Viewer | null, matchId: string) {
  const v = requireRole(viewer, 'candidate');
  await ownMatch(v, matchId);
  return asViewer(v, async (tx) => {
    const accepted = await tx
      .select({ consentId: revealRequests.consentId })
      .from(revealRequests)
      .where(
        and(eq(revealRequests.matchId, matchId), eq(revealRequests.candidateDecision, 'accepted')),
      );
    const ids = accepted.map((a) => a.consentId).filter(Boolean) as string[];
    if (!ids.length) throw new MatchError('There is no introduction to withdraw.', 409);
    const withdrawn = await tx
      .update(consents)
      .set({ withdrawnAt: new Date() })
      .where(
        and(
          inArray(consents.id, ids),
          eq(consents.subjectUserId, v.id),
          isNull(consents.withdrawnAt),
        ),
      )
      .returning({ id: consents.id });
    if (!withdrawn.length)
      throw new MatchError('You have already withdrawn this introduction.', 409);
    await audit(tx, {
      actorId: v.id,
      action: 'reveal.withdraw',
      targetType: 'match',
      targetId: matchId,
      metadata: { consentIds: withdrawn.map((w) => w.id) },
    });
    return { matchId, withdrawn: withdrawn.length };
  });
}
