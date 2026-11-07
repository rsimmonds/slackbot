import 'server-only';
import { formatComp, type Currency } from '@cmobeat/config';
import { levelCompatibility, marketsFromLocations } from '@cmobeat/ai/matching';
import {
  adminDb,
  audit,
  auditLog,
  candidateProfiles,
  companies,
  consents,
  listings,
  mandates,
  moves,
  userRoles,
  users,
} from '@cmobeat/db';
import { careerDigestEmail, emailConfig, sendEmail } from '@cmobeat/email';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { hasActiveConcierge } from './status';
import { BillingError } from './subscriptions';

/**
 * The weekly career digest (spec 5.4.4). Opt-in, for every candidate.
 *
 * Where the preference lives: a `consents` row (kind 'share', scope { purpose: 'career_digest' }).
 * Opting in is consent to receive a recurring email, which is exactly what consents record
 * (granted_at, withdrawn_at, CASL-style evidence), and it needs no migration. Opting out sets
 * withdrawn_at. Nothing about the candidate leaves the system: the digest is built from public
 * live listings and approved moves, matched in-process against their own ideal mandate.
 */
const PURPOSE = 'career_digest';
const digestScope = sql`${consents.scope}->>'purpose' = ${PURPOSE}`;

export async function digestEnabled(viewer: Viewer): Promise<boolean> {
  return asViewer(viewer, async (tx) => {
    const [row] = await tx
      .select({ id: consents.id })
      .from(consents)
      .where(
        and(
          eq(consents.subjectUserId, viewer.id),
          eq(consents.kind, 'share'),
          digestScope,
          isNull(consents.withdrawnAt),
        ),
      )
      .limit(1);
    return !!row;
  });
}

export async function setDigest(viewer: Viewer | null, on: boolean): Promise<boolean> {
  if (!viewer) throw new BillingError('Sign in first.', 401);
  if (!viewer.roles.includes('candidate'))
    throw new BillingError('The digest is for candidates.', 403);
  await asViewer(viewer, async (tx) => {
    if (on) {
      const [existing] = await tx
        .select({ id: consents.id })
        .from(consents)
        .where(
          and(
            eq(consents.subjectUserId, viewer.id),
            eq(consents.kind, 'share'),
            digestScope,
            isNull(consents.withdrawnAt),
          ),
        )
        .limit(1);
      if (existing) return;
      await tx.insert(consents).values({
        subjectUserId: viewer.id,
        kind: 'share',
        scope: { purpose: PURPOSE, text: 'Send me a weekly career digest by email.' },
      });
    } else {
      await tx
        .update(consents)
        .set({ withdrawnAt: new Date() })
        .where(
          and(
            eq(consents.subjectUserId, viewer.id),
            eq(consents.kind, 'share'),
            digestScope,
            isNull(consents.withdrawnAt),
          ),
        );
    }
    await audit(tx, {
      actorId: viewer.id,
      action: on ? 'digest.enabled' : 'digest.disabled',
      targetType: 'user',
      targetId: viewer.id,
    });
  });
  return on;
}

/** ISO year-week, so a digest goes out at most once per person per week. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 864e5 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

type Level = keyof typeof levelCompatibility;

/**
 * Background job (system), weekly. For each opted-in candidate: live listings published in the
 * last 7 days that fit their level, work type and markets, plus approved moves in their industries.
 */
export async function runCareerDigests({ now = new Date() }: { now?: Date } = {}) {
  const db = adminDb();
  const since = new Date(now.getTime() - 7 * 864e5);
  const week = isoWeek(now);

  const people = await db
    .selectDistinct({ userId: users.id, email: users.email })
    .from(consents)
    .innerJoin(users, eq(users.id, consents.subjectUserId))
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'candidate')))
    .where(
      and(
        eq(consents.kind, 'share'),
        digestScope,
        isNull(consents.withdrawnAt),
        isNull(users.deletedAt),
      ),
    );
  if (!people.length) return { sent: 0, skipped: 0, week };

  const fresh = await db
    .select({
      title: mandates.title,
      level: mandates.level,
      workType: mandates.workType,
      market: mandates.market,
      compMin: mandates.compMin,
      compMax: mandates.compMax,
      currency: mandates.currency,
      compBasis: mandates.compBasis,
      company: companies.name,
    })
    .from(listings)
    .innerJoin(mandates, eq(mandates.id, listings.mandateId))
    .innerJoin(companies, eq(companies.id, listings.companyId))
    .where(
      and(
        eq(listings.status, 'live'),
        isNull(listings.deletedAt),
        gte(listings.publishedAt, since),
      ),
    )
    .orderBy(desc(listings.featured), desc(listings.publishedAt));

  const recentMoves = await db
    .select({
      person: moves.personName,
      type: moves.moveType,
      title: moves.title,
      company: companies.name,
      industry: companies.industry,
    })
    .from(moves)
    .innerJoin(companies, eq(companies.id, moves.companyId))
    .where(and(eq(moves.status, 'approved'), gte(moves.approvedAt, since)))
    .orderBy(desc(moves.effectiveDate))
    .limit(50);

  let sent = 0;
  let skipped = 0;
  for (const p of people) {
    const [already] = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'digest.sent'),
          eq(auditLog.targetId, p.userId),
          sql`${auditLog.metadata}->>'week' = ${week}`,
        ),
      )
      .limit(1);
    if (already) {
      skipped++;
      continue;
    }
    const [profile] = await db
      .select({
        level: candidateProfiles.level,
        workTypes: candidateProfiles.workTypes,
        locations: candidateProfiles.locations,
        ideal: candidateProfiles.idealMandate,
      })
      .from(candidateProfiles)
      .where(and(eq(candidateProfiles.userId, p.userId), isNull(candidateProfiles.deletedAt)))
      .limit(1);
    const ideal = (profile?.ideal ?? {}) as {
      workTypes?: string[];
      markets?: string[];
      industries?: string[];
    };
    const loc = marketsFromLocations(profile?.locations ?? []);
    const workTypes = ideal.workTypes?.length ? ideal.workTypes : (profile?.workTypes ?? []);
    const marketsWanted: string[] = ideal.markets?.length ? ideal.markets : loc.markets;
    const industries = (ideal.industries ?? []).map((i) => i.toLowerCase());

    const roles = fresh
      .filter((r) => {
        const okLevel =
          !profile?.level || levelCompatibility[r.level as Level]?.includes(profile.level as Level);
        const okWork = !workTypes.length || workTypes.includes(r.workType);
        const okMarket = !marketsWanted.length || marketsWanted.includes(r.market);
        return okLevel && okWork && okMarket;
      })
      .slice(0, 6)
      .map((r) => {
        const comp =
          r.compMin && r.compMax
            ? ` · ${formatComp(r.compMin, r.compMax, r.currency as Currency, r.compBasis)}`
            : '';
        return `${r.title}, ${r.company}${comp}`;
      });
    const movesForThem = recentMoves
      .filter(
        (m) =>
          !industries.length ||
          industries.some(
            (i) => m.industry.toLowerCase().includes(i) || i.includes(m.industry.toLowerCase()),
          ),
      )
      .slice(0, 5)
      .map((m) => `${m.person} · ${m.type} · ${m.title}, ${m.company}`);

    const concierge = await hasActiveConcierge(p.userId);
    const mail = await careerDigestEmail({
      to: p.email,
      roles,
      moves: movesForThem,
      concierge,
      manageUrl: `${emailConfig().siteUrl}/me#digest`,
    });
    await sendEmail({
      ...mail,
      payload: { week, roles: roles.length, moves: movesForThem.length },
    });
    await audit(db, {
      actorId: null,
      action: 'digest.sent',
      targetType: 'user',
      targetId: p.userId,
      metadata: { week, roles: roles.length, moves: movesForThem.length },
    });
    sent++;
  }
  return { sent, skipped, week };
}
