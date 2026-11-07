import 'server-only';
import { audit, candidateProfiles, companies, consents, profileBlocklist } from '@cmobeat/db';
import { and, asc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { ensureProfile, ProfileError, requireCandidate } from './profile';

export const visibilities = ['hidden', 'anonymous', 'open'] as const;
export type Visibility = (typeof visibilities)[number];

const rank: Record<Visibility, number> = { hidden: 0, anonymous: 1, open: 2 };
export const widens = (from: Visibility, to: Visibility) => rank[to] > rank[from];

/** Exactly who sees what at each level. Shown on the page and recorded with each consent. */
export const visibilityTerms: Record<
  Visibility,
  { label: string; summary: string; disclosures: { recipient: string; fields: string[] }[] }
> = {
  hidden: {
    label: 'Hidden',
    summary: 'Your profile is visible to no one. Not employers, not our staff. Nothing is matched.',
    disclosures: [],
  },
  anonymous: {
    label: 'Anonymous matching only',
    summary:
      'Our talent partners can see your outcomes and ideal mandate, without your name or contact details, to propose matches. Employers see nothing unless a person approves a match and you consent to reveal yourself.',
    disclosures: [
      {
        recipient: 'CMO Beat talent partners',
        fields: ['Headline', 'Outcomes', 'Ideal next mandate', 'Level and years'],
      },
      { recipient: 'Employers', fields: ['Nothing, until you consent to a reveal'] },
    ],
  },
  open: {
    label: 'Open',
    summary:
      'Talent partners can see your profile and contact you about roles. Employers still see an anonymized dossier first, and your identity only after you consent to each reveal.',
    disclosures: [
      {
        recipient: 'CMO Beat talent partners',
        fields: [
          'Headline',
          'Outcomes',
          'Ideal next mandate',
          'Level and years',
          'That you are open to contact',
        ],
      },
      { recipient: 'Employers', fields: ['Anonymized match dossiers approved by a person'] },
    ],
  },
};

export const visibilitySchema = z.object({
  visibility: z.enum(visibilities),
  /** Required (true) when widening: the candidate confirmed in the Consent Gate. */
  consent: z.boolean().optional(),
});

export async function setVisibility(viewer: Viewer, input: z.infer<typeof visibilitySchema>) {
  requireCandidate(viewer);
  const { visibility, consent } = visibilitySchema.parse(input);
  return asViewer(viewer, async (tx) => {
    const profile = await ensureProfile(tx, viewer);
    const from = profile.visibility;
    if (from === visibility) return { visibility, changed: false };
    const now = new Date();
    if (widens(from, visibility)) {
      if (consent !== true)
        throw new ProfileError(
          'Widening who can see your profile needs your explicit consent.',
          422,
        );
      await tx.insert(consents).values({
        subjectUserId: viewer.id,
        kind: 'share',
        scope: { visibility, from, disclosures: visibilityTerms[visibility].disclosures },
        grantedAt: now,
      });
    } else {
      // Narrowing is instant and withdraws earlier sharing consents.
      await tx
        .update(consents)
        .set({ withdrawnAt: now, updatedAt: now })
        .where(
          and(
            eq(consents.subjectUserId, viewer.id),
            eq(consents.kind, 'share'),
            isNull(consents.withdrawnAt),
          ),
        );
      if (visibility !== 'hidden')
        await tx.insert(consents).values({
          subjectUserId: viewer.id,
          kind: 'share',
          scope: { visibility, from, disclosures: visibilityTerms[visibility].disclosures },
          grantedAt: now,
        });
    }
    await tx
      .update(candidateProfiles)
      .set({ visibility, lastActiveAt: now, updatedAt: now })
      .where(eq(candidateProfiles.id, profile.id));
    await audit(tx, {
      actorId: viewer.id,
      action: widens(from, visibility) ? 'profile.visibility.widen' : 'profile.visibility.narrow',
      targetType: 'candidate_profile',
      targetId: profile.id,
      metadata: { from, to: visibility },
    });
    return { visibility, changed: true };
  });
}

// ---------------------------------------------------------------- blocklist

export interface BlockedCompany {
  companyId: string;
  name: string;
  industry: string;
  isCurrentEmployer: boolean;
}

export async function listBlocklist(viewer: Viewer): Promise<{
  currentEmployer: { id: string; name: string } | null;
  blocked: BlockedCompany[];
}> {
  requireCandidate(viewer);
  return asViewer(viewer, async (tx) => {
    const profile = await ensureProfile(tx, viewer);
    const rows = await tx
      .select({ companyId: companies.id, name: companies.name, industry: companies.industry })
      .from(profileBlocklist)
      .innerJoin(companies, eq(companies.id, profileBlocklist.companyId))
      .where(eq(profileBlocklist.profileId, profile.id))
      .orderBy(asc(companies.name));
    const current = rows.find((r) => r.companyId === profile.currentCompanyId);
    return {
      currentEmployer: current ? { id: current.companyId, name: current.name } : null,
      blocked: rows.map((r) => ({
        ...r,
        isCurrentEmployer: r.companyId === profile.currentCompanyId,
      })),
    };
  });
}

export async function searchCompanies(viewer: Viewer, q: string) {
  requireCandidate(viewer);
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  return asViewer(viewer, (tx) =>
    tx
      .select({
        id: companies.id,
        name: companies.name,
        industry: companies.industry,
        market: companies.market,
      })
      .from(companies)
      .where(
        and(
          ilike(companies.name, `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`),
          isNull(companies.deletedAt),
        ),
      )
      .orderBy(sql`position(lower(${term}) in lower(${companies.name}))`, asc(companies.name))
      .limit(8),
  );
}

export async function blockCompany(viewer: Viewer, companyId: string) {
  requireCandidate(viewer);
  z.uuid().parse(companyId);
  return asViewer(viewer, async (tx) => {
    const profile = await ensureProfile(tx, viewer);
    const [company] = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId));
    if (!company) throw new ProfileError('Company not found.', 404);
    await tx
      .insert(profileBlocklist)
      .values({ profileId: profile.id, companyId })
      .onConflictDoNothing();
    await audit(tx, {
      actorId: viewer.id,
      action: 'profile.blocklist.add',
      targetType: 'candidate_profile',
      targetId: profile.id,
      metadata: { companyId },
    });
  });
}

export async function unblockCompany(viewer: Viewer, companyId: string) {
  requireCandidate(viewer);
  z.uuid().parse(companyId);
  return asViewer(viewer, async (tx) => {
    const profile = await ensureProfile(tx, viewer);
    if (profile.currentCompanyId === companyId)
      throw new ProfileError(
        'Your current employer stays blocked while you work there. Change your current employer first.',
        409,
      );
    await tx
      .delete(profileBlocklist)
      .where(
        and(eq(profileBlocklist.profileId, profile.id), eq(profileBlocklist.companyId, companyId)),
      );
    await audit(tx, {
      actorId: viewer.id,
      action: 'profile.blocklist.remove',
      targetType: 'candidate_profile',
      targetId: profile.id,
      metadata: { companyId },
    });
  });
}

/** Setting a current employer blocks it automatically. Clearing it leaves the block in place. */
export async function setCurrentEmployer(viewer: Viewer, companyId: string | null) {
  requireCandidate(viewer);
  if (companyId !== null) z.uuid().parse(companyId);
  return asViewer(viewer, async (tx) => {
    const profile = await ensureProfile(tx, viewer);
    if (companyId) {
      const [company] = await tx
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, companyId));
      if (!company) throw new ProfileError('Company not found.', 404);
      await tx
        .insert(profileBlocklist)
        .values({ profileId: profile.id, companyId })
        .onConflictDoNothing();
    }
    await tx
      .update(candidateProfiles)
      .set({ currentCompanyId: companyId, updatedAt: new Date() })
      .where(eq(candidateProfiles.id, profile.id));
    await audit(tx, {
      actorId: viewer.id,
      action: 'profile.current_employer',
      targetType: 'candidate_profile',
      targetId: profile.id,
      metadata: { companyId },
    });
  });
}
