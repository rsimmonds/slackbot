import { sessionStateAad } from '@cmobeat/ai/interview';
import 'server-only';
import {
  finalizeProfile,
  OutcomeSchema,
  type ProfileDraft,
  type ProfilePortfolio,
} from '@cmobeat/ai';
import { markets } from '@cmobeat/config';
import {
  audit,
  candidateProfiles,
  decryptJson,
  interviewSessions,
  profileOutcomes,
  type Tx,
} from '@cmobeat/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { ensureProfile, ProfileError, requireCandidate } from './profile';

/**
 * Review and approval (spec 5.4.1: "Candidate approves every line"). The finalized draft is split
 * into lines; the candidate approves, edits or removes each one, and nothing is written until
 * every line has a decision.
 */

/** Session state as the interview engine stores it, encrypted in interview_sessions.transcript. */
export interface StoredSessionState {
  turns: { role: 'assistant' | 'user'; text: string; at: string }[];
  draft: Partial<ProfileDraft>;
  remaining: string[];
  questionIndex: number;
  done: boolean;
}

/** Same context the interview engine encrypts with. */
export const sessionAad = sessionStateAad;

const levels = ['vp_marketing', 'cmo', 'chief_growth_officer', 'fractional_cmo'] as const;

export type ReviewLine =
  | {
      id: 'role';
      kind: 'role';
      value: { level: (typeof levels)[number]; yearsExperience: number | null };
    }
  | { id: 'headline'; kind: 'headline'; value: string }
  | { id: `outcome:${number}`; kind: 'outcome'; value: z.infer<typeof OutcomeSchema> }
  | { id: `team:${number}`; kind: 'team'; value: string }
  | { id: 'ai'; kind: 'ai'; value: string }
  | { id: 'ideal.summary'; kind: 'idealSummary'; value: string }
  | { id: 'ideal.fit'; kind: 'idealFit'; value: { stages: string[]; industries: string[] } }
  | {
      id: 'ideal.terms';
      kind: 'idealTerms';
      value: { workTypes: ('full_time' | 'fractional')[]; markets: (typeof markets)[number][] };
    }
  | { id: 'ideal.reporting'; kind: 'idealReporting'; value: string | null }
  | { id: 'ideal.dealBreakers'; kind: 'idealDealBreakers'; value: string[] };

export function portfolioLines(p: ProfilePortfolio): ReviewLine[] {
  const lines: ReviewLine[] = [
    { id: 'role', kind: 'role', value: { level: p.level, yearsExperience: p.yearsExperience } },
    { id: 'headline', kind: 'headline', value: p.headline },
    ...p.outcomes.map((o, i) => ({
      id: `outcome:${i}` as const,
      kind: 'outcome' as const,
      value: o,
    })),
    ...p.teamBuilds.map((t, i) => ({ id: `team:${i}` as const, kind: 'team' as const, value: t })),
  ];
  if (p.aiFluency) lines.push({ id: 'ai', kind: 'ai', value: p.aiFluency });
  const m = p.idealMandate;
  lines.push(
    { id: 'ideal.summary', kind: 'idealSummary', value: m.summary },
    { id: 'ideal.fit', kind: 'idealFit', value: { stages: m.stages, industries: m.industries } },
    {
      id: 'ideal.terms',
      kind: 'idealTerms',
      value: { workTypes: m.workTypes, markets: m.markets },
    },
    { id: 'ideal.reporting', kind: 'idealReporting', value: m.reportingLine },
    { id: 'ideal.dealBreakers', kind: 'idealDealBreakers', value: m.dealBreakers },
  );
  return lines;
}

async function loadSession(tx: Tx, ownerId: string, sessionId: string) {
  if (!z.uuid().safeParse(sessionId).success) throw new ProfileError('Session not found.', 404);
  const [s] = await tx
    .select()
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.id, sessionId),
        eq(interviewSessions.ownerId, ownerId),
        eq(interviewSessions.kind, 'profile'),
      ),
    )
    .limit(1);
  if (!s?.transcript) throw new ProfileError('Session not found.', 404);
  return s;
}

export interface ReviewDraft {
  sessionId: string;
  publicRef: string;
  lines: ReviewLine[];
  /** Protected attributes the interviewer left out (names only), to tell the candidate. */
  scrubbed: string[];
  alreadySaved: boolean;
}

/**
 * The candidate's finalized draft, ready for line-by-line review. Only the session owner can read
 * it: the query runs under RLS and the state is decrypted with the session id as AAD.
 */
export async function getProfileDraftForReview(
  viewer: Viewer,
  sessionId: string,
): Promise<ReviewDraft> {
  requireCandidate(viewer);
  return asViewer(viewer, async (tx) => {
    const s = await loadSession(tx, viewer.id, sessionId);
    const state = await decryptJson<StoredSessionState>(s.transcript!, { aad: sessionAad(s.id) });
    let portfolio: ProfilePortfolio;
    try {
      portfolio = finalizeProfile(state.draft);
    } catch {
      throw new ProfileError(
        'This interview needs at least three results with numbers before it can be reviewed. Resume it to add more.',
        409,
      );
    }
    return {
      sessionId: s.id,
      publicRef: s.publicRef,
      lines: portfolioLines(portfolio),
      scrubbed: state.draft.scrubbed ?? [],
      alreadySaved: !!s.profileId,
    };
  });
}

// ---------------------------------------------------------------- save

const editValue: Record<ReviewLine['kind'], z.ZodType> = {
  role: z.object({
    level: z.enum(levels),
    yearsExperience: z.number().int().min(0).max(60).nullable(),
  }),
  headline: z.string().trim().min(10).max(140),
  outcome: OutcomeSchema,
  team: z.string().trim().min(3).max(200),
  ai: z.string().trim().min(3).max(400),
  idealSummary: z.string().trim().min(10).max(400),
  idealFit: z.object({
    stages: z.array(z.string().max(40)).max(4),
    industries: z.array(z.string().max(40)).max(6),
  }),
  idealTerms: z.object({
    workTypes: z.array(z.enum(['full_time', 'fractional'])).min(1),
    markets: z.array(z.enum(markets)).min(1),
  }),
  idealReporting: z.string().trim().max(60).nullable(),
  idealDealBreakers: z.array(z.string().trim().min(2).max(120)).max(5),
};

export const decisionsSchema = z.object({
  sessionId: z.uuid(),
  decisions: z
    .array(
      z.object({
        id: z.string().max(40),
        action: z.enum(['approve', 'edit', 'remove']),
        value: z.unknown().optional(),
      }),
    )
    .max(60),
});
export type Decisions = z.infer<typeof decisionsSchema>;

export interface SaveResult {
  profileId: string;
  approved: number;
  edited: number;
  removed: number;
  outcomes: number;
}

export async function savePortfolio(viewer: Viewer, input: Decisions): Promise<SaveResult> {
  requireCandidate(viewer);
  const { sessionId, decisions } = decisionsSchema.parse(input);
  const draft = await getProfileDraftForReview(viewer, sessionId);
  const byId = new Map(decisions.map((d) => [d.id, d]));

  const missing = draft.lines.filter((l) => !byId.has(l.id)).map((l) => l.id);
  if (missing.length)
    throw new ProfileError(`Every line needs a decision. Still open: ${missing.join(', ')}.`, 422);
  const unknown = decisions.filter((d) => !draft.lines.some((l) => l.id === d.id));
  if (unknown.length) throw new ProfileError('Unknown lines in the decision list.', 422);

  // Resolve each line to its final value (or null when removed).
  const final = new Map<string, unknown>();
  for (const line of draft.lines) {
    const d = byId.get(line.id)!;
    if (d.action === 'remove') final.set(line.id, null);
    else if (d.action === 'approve') final.set(line.id, line.value);
    else {
      const parsed = editValue[line.kind].safeParse(d.value);
      if (!parsed.success)
        throw new ProfileError(
          `"${line.id}": ${parsed.error.issues[0]?.message ?? 'invalid edit'}`,
          422,
        );
      final.set(line.id, parsed.data);
    }
  }
  const kept = <T>(id: string) => final.get(id) as T | null | undefined;
  const role = kept<{ level: (typeof levels)[number]; yearsExperience: number | null }>('role');
  const outcomes = draft.lines
    .filter((l) => l.kind === 'outcome')
    .map((l) => kept<z.infer<typeof OutcomeSchema>>(l.id))
    .filter((o): o is z.infer<typeof OutcomeSchema> => !!o);
  const teams = draft.lines
    .filter((l) => l.kind === 'team')
    .map((l) => kept<string>(l.id))
    .filter((t): t is string => !!t);
  const ai = kept<string>('ai');
  const fit = kept<{ stages: string[]; industries: string[] }>('ideal.fit');
  const terms = kept<{
    workTypes: ('full_time' | 'fractional')[];
    markets: (typeof markets)[number][];
  }>('ideal.terms');
  const idealMandate = {
    summary: kept<string>('ideal.summary') ?? null,
    stages: fit?.stages ?? [],
    industries: fit?.industries ?? [],
    workTypes: terms?.workTypes ?? [],
    markets: terms?.markets ?? [],
    reportingLine: kept<string | null>('ideal.reporting') ?? null,
    dealBreakers: kept<string[]>('ideal.dealBreakers') ?? [],
    approvedAt: new Date().toISOString(),
  };

  const counts = { approved: 0, edited: 0, removed: 0 };
  for (const d of decisions)
    counts[d.action === 'approve' ? 'approved' : d.action === 'edit' ? 'edited' : 'removed']++;

  return asViewer(viewer, async (tx) => {
    const profile = await ensureProfile(tx, viewer);
    const now = new Date();
    await tx
      .update(candidateProfiles)
      .set({
        headline: kept<string>('headline') ?? null,
        level: role?.level ?? null,
        yearsExperience: role?.yearsExperience ?? null,
        idealMandate,
        ...(terms ? { workTypes: terms.workTypes } : {}),
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(candidateProfiles.id, profile.id));

    // The approved portfolio replaces the previous one.
    await tx.delete(profileOutcomes).where(eq(profileOutcomes.profileId, profile.id));
    const rows = [
      ...outcomes.map((o) => ({ ...o })),
      // Team builds and AI fluency have no dedicated columns yet; they are stored as outcome lines.
      ...teams.map((t) => ({
        outcomeType: 'team',
        metric: 'Team built',
        value: t.match(/\d[\d,]*\s*(?:people|person|reports)?/)?.[0]?.trim() ?? 'See context',
        context: t,
        evidenceNote: null,
      })),
      ...(ai
        ? [
            {
              outcomeType: 'ai_fluency',
              metric: 'AI in practice',
              value: 'Workflow',
              context: ai,
              evidenceNote: null,
            },
          ]
        : []),
    ];
    if (rows.length)
      await tx
        .insert(profileOutcomes)
        .values(rows.map((r) => ({ ...r, profileId: profile.id, candidateApprovedAt: now })));
    await tx
      .update(interviewSessions)
      .set({ profileId: profile.id, updatedAt: now })
      .where(eq(interviewSessions.id, sessionId));
    await audit(tx, {
      actorId: viewer.id,
      action: 'profile.approve',
      targetType: 'candidate_profile',
      targetId: profile.id,
      metadata: { sessionId, ...counts, outcomes: outcomes.length },
    });
    return { profileId: profile.id, ...counts, outcomes: outcomes.length };
  });
}
