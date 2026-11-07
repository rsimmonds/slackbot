import type { Role } from '@cmobeat/config';
import {
  adminDb,
  audit,
  candidateProfiles,
  companies,
  employerMembers,
  mandates,
  matches,
  profileBlocklist,
  userRoles,
  users,
} from '@cmobeat/db';
import { devUsers } from '@cmobeat/db/dev-users';
import { and, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import type { Viewer } from '@/lib/auth';

/**
 * Test helpers that stand in for the matching pipeline: they create what
 * proposeMatchesForMandate would (a confirmed mandate and 'proposed' matches with an
 * audit entry), so review, reveal and messaging can be tested without the Matcher.
 */

export const devEmployer = () => devUsers.find((u) => u.email === 'employer@sample.cmobeat.dev')!;

export async function viewerFor(userId: string): Promise<Viewer> {
  const db = adminDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const roles = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return {
    id: u!.id,
    email: u!.email,
    name: u!.displayName,
    roles: roles.map((r) => r.role as Role),
  };
}

export async function employerCompanyId(userId = devEmployer().id): Promise<string> {
  const [m] = await adminDb()
    .select({ companyId: employerMembers.companyId })
    .from(employerMembers)
    .where(eq(employerMembers.userId, userId))
    .limit(1);
  return m!.companyId;
}

/** A confirmed mandate for the employer's company. */
export async function createConfirmedMandate(companyId?: string, confirmed = true) {
  const cid = companyId ?? (await employerCompanyId());
  const [m] = await adminDb()
    .insert(mandates)
    .values({
      companyId: cid,
      source: 'builder',
      title: `Chief Marketing Officer ${Math.random().toString(36).slice(2, 6)}`,
      level: 'cmo',
      scope: 'Own brand, demand and product marketing through the move upmarket.',
      reportingLine: 'CEO',
      teamSize: 24,
      priorities: ['Reposition for the mid-market', 'Double marketing-sourced pipeline'],
      compMin: 380_000,
      compMax: 450_000,
      currency: 'USD',
      compBasis: 'annual',
      workType: 'full_time',
      market: 'US',
      confirmedAt: confirmed ? new Date() : null,
    })
    .returning({ id: mandates.id, companyId: mandates.companyId });
  return m!;
}

/** Seeded candidates whose profiles are matchable for a company (visible, not blocking it). */
export async function matchableCandidates(companyId: string, n: number, exclude: string[] = []) {
  const db = adminDb();
  const blocked = db
    .select({ id: profileBlocklist.profileId })
    .from(profileBlocklist)
    .where(eq(profileBlocklist.companyId, companyId));
  const rows = await db
    .select({ profileId: candidateProfiles.id, userId: candidateProfiles.userId })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(
      and(
        ne(candidateProfiles.visibility, 'hidden'),
        isNull(candidateProfiles.deletedAt),
        isNull(users.deletedAt),
        notInArray(candidateProfiles.id, blocked),
        exclude.length ? notInArray(candidateProfiles.id, exclude) : sql`true`,
      ),
    )
    .orderBy(candidateProfiles.id)
    .limit(n);
  if (rows.length < n) throw new Error('Not enough matchable seeded candidates');
  return rows;
}

/** Insert proposals exactly as the Matcher would: status 'proposed', rationale, audit entry. */
export async function proposeMatches(mandateId: string, profileIds: string[]) {
  const db = adminDb();
  const ids: string[] = [];
  for (const [i, profileId] of profileIds.entries()) {
    const [m] = await db
      .insert(matches)
      .values({
        mandateId,
        profileId,
        scoreLow: (60 + i) / 100,
        scoreHigh: (78 + i) / 100,
        rationale: {
          summary: `Led a comparable upmarket repositioning, with metrics (${i + 1}).`,
          reasons: [
            {
              reason: 'Took sourced pipeline from 18% to 46% at a similar stage.',
              direction: 'for',
            },
            { reason: 'Built a demand team of 30.', direction: 'for' },
            { reason: 'No direct experience reporting to a founder-CEO.', direction: 'against' },
          ],
        },
      })
      .returning({ id: matches.id });
    await audit(db, {
      actorId: null,
      action: 'match.propose',
      targetType: 'match',
      targetId: m!.id,
      metadata: { source: 'test-fixture' },
    });
    ids.push(m!.id);
  }
  return ids;
}

/** A second employer at a different company, to prove one company never sees another's matches. */
export async function otherEmployer(): Promise<Viewer> {
  const db = adminDb();
  const mine = await employerCompanyId();
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(ne(companies.id, mine))
    .limit(1);
  const email = `other-employer-${Math.random().toString(36).slice(2, 8)}@sample.cmobeat.dev`;
  const [u] = await db
    .insert(users)
    .values({ email, displayName: 'Other Employer', isSample: true })
    .returning({ id: users.id });
  await db.insert(userRoles).values([
    { userId: u!.id, role: 'reader' },
    { userId: u!.id, role: 'employer' },
  ]);
  await db
    .insert(employerMembers)
    .values({ userId: u!.id, companyId: company!.id, seatRole: 'owner' });
  return viewerFor(u!.id);
}

export async function auditActions(matchIds: string[]) {
  const { auditLog } = await import('@cmobeat/db');
  return adminDb()
    .select({ action: auditLog.action, targetId: auditLog.targetId })
    .from(auditLog)
    .where(and(eq(auditLog.targetType, 'match'), inArray(auditLog.targetId, matchIds)));
}
