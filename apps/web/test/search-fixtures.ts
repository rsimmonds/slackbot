import {
  adminDb,
  candidateProfiles,
  consents,
  employerMembers,
  mandates,
  matches,
  revealRequests,
} from '@cmobeat/db';
import { devUsers } from '@cmobeat/db/dev-users';
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';

const employer = devUsers.find((u) => u.email === 'employer@sample.cmobeat.dev')!;
const talent = devUsers.find((u) => u.email === 'talent@sample.cmobeat.dev')!;

export async function devEmployerCompanyId() {
  const [m] = await adminDb()
    .select({ companyId: employerMembers.companyId })
    .from(employerMembers)
    .where(eq(employerMembers.userId, employer.id))
    .limit(1);
  return m!.companyId;
}

/** A fresh confirmed mandate for the dev employer's company. */
export async function confirmedMandate(
  opts: {
    workType?: 'full_time' | 'fractional';
    currency?: 'USD' | 'CAD' | 'EUR' | 'GBP';
    confirmed?: boolean;
    companyId?: string;
  } = {},
) {
  const workType = opts.workType ?? 'full_time';
  const [row] = await adminDb()
    .insert(mandates)
    .values({
      companyId: opts.companyId ?? (await devEmployerCompanyId()),
      source: 'builder',
      title: workType === 'fractional' ? 'Fractional CMO (test)' : 'Chief Marketing Officer (test)',
      level: workType === 'fractional' ? 'fractional_cmo' : 'cmo',
      workType,
      compBasis: workType === 'fractional' ? 'monthly_retainer' : 'annual',
      compMin: workType === 'fractional' ? 12_000 : 380_000,
      compMax: workType === 'fractional' ? 16_000 : 450_000,
      currency: opts.currency ?? 'USD',
      market: opts.currency === 'EUR' ? 'EU' : 'US',
      priorities: ['Rebuild demand', 'Reposition the brand', 'Hire a PMM lead'],
      confirmedAt: opts.confirmed === false ? null : new Date(),
    })
    .returning({ id: mandates.id });
  return row!.id;
}

/** A company the dev employer does not belong to. */
export async function otherCompanyId() {
  const own = await devEmployerCompanyId();
  const [m] = await adminDb()
    .select({ companyId: mandates.companyId })
    .from(mandates)
    .where(ne(mandates.companyId, own))
    .limit(1);
  return m!.companyId;
}

/**
 * A match for the mandate, optionally revealed with the candidate's live reveal consent — what a
 * placement requires. Written as the system, the way the matcher and the reveal trigger would.
 */
export async function matchFor(
  mandateId: string,
  opts: { status?: 'approved' | 'revealed'; consentWithdrawn?: boolean } = {},
) {
  const db = adminDb();
  const [profile] = await db
    .select({ id: candidateProfiles.id, userId: candidateProfiles.userId })
    .from(candidateProfiles)
    .where(
      and(
        ne(candidateProfiles.visibility, 'hidden'),
        isNotNull(candidateProfiles.headline),
        // One match per mandate and profile: skip profiles other suites already matched here.
        sql`not exists (select 1 from matches m where m.mandate_id = ${mandateId} and m.profile_id = ${candidateProfiles.id})`,
      ),
    )
    .orderBy(sql`random()`)
    .limit(1);
  const status = opts.status ?? 'revealed';
  const [m] = await db
    .insert(matches)
    .values({
      mandateId,
      profileId: profile!.id,
      scoreLow: 0.62,
      scoreHigh: 0.78,
      rationale: { summary: 'Test match' },
      status,
      reviewedBy: talent.id,
      reviewedAt: new Date(),
    })
    .returning({ id: matches.id });
  if (status === 'revealed') {
    const [c] = await db
      .insert(consents)
      .values({
        subjectUserId: profile!.userId,
        kind: 'reveal',
        scope: { matchId: m!.id },
        withdrawnAt: opts.consentWithdrawn ? new Date() : null,
      })
      .returning({ id: consents.id });
    await db.insert(revealRequests).values({
      matchId: m!.id,
      requestedBy: employer.id,
      candidateDecision: 'accepted',
      decidedAt: new Date(),
      consentId: c!.id,
    });
  }
  return m!.id;
}
