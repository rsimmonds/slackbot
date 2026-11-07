import 'server-only';
import {
  audit,
  candidateProfiles,
  companies,
  decryptJson,
  encryptJson,
  files,
  interviewSessions,
  profileBlocklist,
  profileOutcomes,
  type Tx,
} from '@cmobeat/db';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';

/** Errors the profile API maps to HTTP responses. */
export class ProfileError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function requireCandidate(viewer: Viewer | null): Viewer {
  if (!viewer) throw new ProfileError('Sign in to continue.', 401);
  if (!viewer.roles.includes('candidate')) throw new ProfileError('This is for candidates.', 403);
  return viewer;
}

export type ProfileRow = typeof candidateProfiles.$inferSelect;

/** The viewer's own profile (RLS: owner only). */
export async function myProfile(tx: Tx, userId: string): Promise<ProfileRow | null> {
  const [row] = await tx
    .select()
    .from(candidateProfiles)
    .where(and(eq(candidateProfiles.userId, userId), isNull(candidateProfiles.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Create the profile on first use. New profiles are hidden: visible to no one. */
export async function ensureProfile(tx: Tx, viewer: Viewer): Promise<ProfileRow> {
  const existing = await myProfile(tx, viewer.id);
  if (existing) return existing;
  const [row] = await tx
    .insert(candidateProfiles)
    .values({ userId: viewer.id, visibility: 'hidden' })
    .returning();
  await audit(tx, {
    actorId: viewer.id,
    action: 'profile.create',
    targetType: 'candidate_profile',
    targetId: row!.id,
  });
  return row!;
}

// ---------------------------------------------------------------- encrypted context (résumé text)

/**
 * What the candidate uploaded, and the scrubbed text the interviewer may use as context.
 * Stored encrypted in candidate_profiles.resume_ref, bound to the profile id.
 */
export interface ProfileContext {
  version: 1;
  files: { id: string; purpose: 'resume' | 'linkedin_pdf'; uploadedAt: string; pages: number }[];
  /** Scrubbed text per document: no contact details, no protected attributes. Capped in length. */
  texts: Partial<Record<'resume' | 'linkedin_pdf', string>>;
}

const contextAad = (profileId: string) => `candidate_profiles.resume_ref:${profileId}`;
export const MAX_CONTEXT_CHARS = 20_000;

/** The text the interviewer may read, one labelled section per document. */
export const contextText = (c: ProfileContext) =>
  Object.entries(c.texts)
    .map(([k, v]) => `[${k === 'resume' ? 'Résumé' : 'LinkedIn export'}]\n${v}`)
    .join('\n\n');

export async function readContext(profile: Pick<ProfileRow, 'id' | 'resumeRef'>): Promise<ProfileContext> {
  const empty: ProfileContext = { version: 1, files: [], texts: {} };
  if (!profile.resumeRef) return empty;
  try {
    const value = await decryptJson<unknown>(profile.resumeRef, { aad: contextAad(profile.id) });
    if (value && typeof value === 'object' && (value as ProfileContext).version === 1) return value as ProfileContext;
  } catch {
    // Older rows (sample data) hold a plain storage path, not JSON. Treat as no context.
  }
  return empty;
}

export async function writeContext(tx: Tx, profileId: string, value: ProfileContext): Promise<void> {
  await tx
    .update(candidateProfiles)
    .set({
      resumeRef: await encryptJson(
        {
          ...value,
          texts: Object.fromEntries(
            Object.entries(value.texts).map(([k, v]) => [k, (v ?? '').slice(0, MAX_CONTEXT_CHARS)]),
          ),
        },
        { aad: contextAad(profileId) },
      ),
      updatedAt: new Date(),
    })
    .where(eq(candidateProfiles.id, profileId));
}

/**
 * Interview context for the Profile Interviewer: the scrubbed résumé text, nothing else.
 * Runs as the candidate, so only their own profile can be read.
 */
export async function interviewContextFor(viewer: Viewer): Promise<string> {
  return asViewer(viewer, async (tx) => {
    const profile = await myProfile(tx, viewer.id);
    return profile ? contextText(await readContext(profile)) : '';
  });
}

// ---------------------------------------------------------------- AI notice

export async function acknowledgeAiNotice(viewer: Viewer): Promise<Date> {
  requireCandidate(viewer);
  return asViewer(viewer, async (tx) => {
    const profile = await ensureProfile(tx, viewer);
    if (profile.aiNoticeAckAt) return profile.aiNoticeAckAt;
    const at = new Date();
    await tx
      .update(candidateProfiles)
      .set({ aiNoticeAckAt: at, updatedAt: at })
      .where(eq(candidateProfiles.id, profile.id));
    await audit(tx, {
      actorId: viewer.id,
      action: 'profile.ai_notice_ack',
      targetType: 'candidate_profile',
      targetId: profile.id,
    });
    return at;
  });
}

// ---------------------------------------------------------------- dashboard

export interface CandidateOverview {
  hasProfile: boolean;
  aiNoticeAckAt: Date | null;
  visibility: ProfileRow['visibility'];
  headline: string | null;
  approvedOutcomes: number;
  blocklistCount: number;
  currentEmployer: string | null;
  uploads: number;
  lastSession: { id: string; status: string; updatedAt: Date; profileId: string | null } | null;
}

export async function candidateOverview(viewer: Viewer): Promise<CandidateOverview> {
  requireCandidate(viewer);
  return asViewer(viewer, async (tx) => {
    const profile = await myProfile(tx, viewer.id);
    const [last] = await tx
      .select({
        id: interviewSessions.id,
        status: interviewSessions.status,
        updatedAt: interviewSessions.updatedAt,
        profileId: interviewSessions.profileId,
      })
      .from(interviewSessions)
      .where(and(eq(interviewSessions.ownerId, viewer.id), eq(interviewSessions.kind, 'profile')))
      .orderBy(desc(interviewSessions.updatedAt))
      .limit(1);
    const [uploads] = await tx
      .select({ n: count() })
      .from(files)
      .where(and(eq(files.ownerId, viewer.id), isNull(files.deletedAt)));
    if (!profile) {
      return {
        hasProfile: false,
        aiNoticeAckAt: null,
        visibility: 'hidden',
        headline: null,
        approvedOutcomes: 0,
        blocklistCount: 0,
        currentEmployer: null,
        uploads: uploads?.n ?? 0,
        lastSession: last ?? null,
      };
    }
    const [outcomes] = await tx
      .select({ n: count() })
      .from(profileOutcomes)
      .where(eq(profileOutcomes.profileId, profile.id));
    const [blocks] = await tx
      .select({ n: count() })
      .from(profileBlocklist)
      .where(eq(profileBlocklist.profileId, profile.id));
    const [employer] = profile.currentCompanyId
      ? await tx
          .select({ name: companies.name })
          .from(companies)
          .where(eq(companies.id, profile.currentCompanyId))
      : [];
    return {
      hasProfile: true,
      aiNoticeAckAt: profile.aiNoticeAckAt,
      visibility: profile.visibility,
      headline: profile.headline,
      approvedOutcomes: outcomes?.n ?? 0,
      blocklistCount: blocks?.n ?? 0,
      currentEmployer: employer?.name ?? null,
      uploads: uploads?.n ?? 0,
      lastSession: last ?? null,
    };
  });
}
