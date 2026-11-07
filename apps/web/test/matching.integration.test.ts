import { embeddingModels } from '@cmobeat/ai';
import {
  adminDb,
  auditLog,
  candidateProfiles,
  closeDb,
  companies,
  embeddings,
  encryptJson,
  mandates,
  matches,
  profileBlocklist,
  searches,
  users,
} from '@cmobeat/db';
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import {
  MatchingError,
  openMandateIds,
  prepareMandate,
  proposeMatchesForMandate,
  type ProposeResult,
} from '@/lib/matching';
import { runFairnessReport } from '@/lib/matching/fairness';
import { listFairnessReports } from '@/lib/matching/reports';
import type { Viewer } from '@/lib/auth';
import { signInAs } from './helpers';

afterAll(closeDb);

/** The first open mandate that yields at least two proposals. */
async function firstProductiveMandate(): Promise<{ mandateId: string; result: ProposeResult }> {
  for (const mandateId of await openMandateIds()) {
    const result = await proposeMatchesForMandate(mandateId, { actorId: null });
    if (result.proposed.length >= 2) return { mandateId, result };
  }
  throw new Error('no open mandate produced proposals from the seed');
}

describe('blind two-stage matching', () => {
  let mandateId: string;
  let result: ProposeResult;

  beforeAll(async () => {
    ({ mandateId, result } = await firstProductiveMandate());
  });

  it('proposes, never approves, and only visible, non-blocklisting candidates', async () => {
    const rows = await adminDb()
      .select({
        m: matches,
        visibility: candidateProfiles.visibility,
        companyId: mandates.companyId,
      })
      .from(matches)
      .innerJoin(candidateProfiles, eq(candidateProfiles.id, matches.profileId))
      .innerJoin(mandates, eq(mandates.id, matches.mandateId))
      .where(inArray(matches.id, result.proposed));
    expect(rows).toHaveLength(result.proposed.length);
    for (const { m, visibility, companyId } of rows) {
      expect(m.status).toBe('proposed');
      expect(m.reviewedBy).toBeNull();
      expect(visibility).not.toBe('hidden');
      expect(m.scoreLow).toBeLessThanOrEqual(m.scoreHigh);
      expect(m.agentRunId).toBeTruthy();
      const rationale = m.rationale as {
        summary: string;
        reasons: { direction: string }[];
        method: string;
      };
      expect(rationale.method).toBe('blind-two-stage');
      expect(new Set(rationale.reasons.map((r) => r.direction))).toEqual(
        new Set(['for', 'against']),
      );
      const blocked = await adminDb()
        .select()
        .from(profileBlocklist)
        .where(
          and(
            eq(profileBlocklist.profileId, m.profileId),
            eq(profileBlocklist.companyId, companyId),
          ),
        );
      expect(blocked).toHaveLength(0);
    }
  });

  it('round-trips fit: the Matcher’s 0–100 range is stored as a 0–1 fraction', async () => {
    const rows = await adminDb()
      .select({
        id: matches.id,
        lo: matches.scoreLow,
        hi: matches.scoreHigh,
        meta: auditLog.metadata,
      })
      .from(matches)
      .innerJoin(
        auditLog,
        and(eq(auditLog.targetId, matches.id), eq(auditLog.action, 'match.proposed')),
      )
      .where(inArray(matches.id, result.proposed));
    expect(rows).toHaveLength(result.proposed.length);
    for (const r of rows) {
      const meta = r.meta as { scoreLow: number; scoreHigh: number };
      expect(Number.isInteger(meta.scoreLow) && Number.isInteger(meta.scoreHigh)).toBe(true);
      expect(r.lo).toBeCloseTo(meta.scoreLow / 100, 5); // e.g. 64 → 0.64
      expect(r.hi).toBeCloseTo(meta.scoreHigh / 100, 5); // e.g. 79 → 0.79
      expect(r.lo).toBeGreaterThanOrEqual(0);
      expect(r.hi).toBeLessThanOrEqual(1);
    }
  });

  it('is idempotent: a second run proposes nothing new', async () => {
    const again = await proposeMatchesForMandate(mandateId, { actorId: null });
    expect(again.proposed).toEqual([]);
    expect(again.skippedExisting).toBeGreaterThanOrEqual(result.proposed.length);
  });

  it('writes an audit entry per proposal and one per run', async () => {
    const perMatch = await adminDb()
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.action, 'match.proposed'), inArray(auditLog.targetId, result.proposed)),
      );
    expect(perMatch).toHaveLength(result.proposed.length);
    const runs = await adminDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'matching.run'), eq(auditLog.targetId, mandateId)));
    expect(runs.length).toBeGreaterThanOrEqual(2);
  });

  it('stores blind embeddings for the mandate and the shortlisted profiles', async () => {
    const [m] = await adminDb()
      .select()
      .from(embeddings)
      .where(and(eq(embeddings.ownerType, 'mandate'), eq(embeddings.ownerId, mandateId)));
    expect(m!.model).toBe(embeddingModels.local);
    const profileIds = (
      await adminDb()
        .select({ id: matches.profileId })
        .from(matches)
        .where(inArray(matches.id, result.proposed))
    ).map((r) => r.id);
    const p = await adminDb()
      .select()
      .from(embeddings)
      .where(
        and(eq(embeddings.ownerType, 'profile_outcomes'), inArray(embeddings.ownerId, profileIds)),
      );
    expect(p).toHaveLength(profileIds.length);
  });

  it('sends the Matcher nothing that identifies a candidate or the company', async () => {
    const open = await openMandateIds();
    for (const id of open) {
      const prep = await prepareMandate(id);
      if (!prep.user) continue;
      const profileIds = Object.values(prep.refToProfile);
      const people = await adminDb()
        .select({
          name: users.displayName,
          email: users.email,
          years: candidateProfiles.yearsExperience,
        })
        .from(candidateProfiles)
        .innerJoin(users, eq(users.id, candidateProfiles.userId))
        .where(inArray(candidateProfiles.id, profileIds));
      const [company] = await adminDb()
        .select({ name: companies.name, domain: companies.domain })
        .from(mandates)
        .innerJoin(companies, eq(companies.id, mandates.companyId))
        .where(eq(mandates.id, id));
      const text = prep.user.toLowerCase();
      for (const p of people) {
        expect(text).not.toContain(p.name.toLowerCase());
        expect(text).not.toContain(p.email.toLowerCase());
      }
      expect(text).not.toContain(company!.name.toLowerCase());
      if (company!.domain) expect(text).not.toContain(company!.domain.toLowerCase());
      expect(text).not.toContain('yearsexperience');
      for (const pid of profileIds) expect(text).not.toContain(pid);
      return;
    }
    throw new Error('no mandate had candidates to send');
  });
});

describe('stage-one filters on real data', () => {
  it('never considers a hidden profile, even when asked to', async () => {
    const [hidden] = await adminDb()
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.visibility, 'hidden'))
      .limit(1);
    const [mandateId] = await openMandateIds(1);
    const r = await proposeMatchesForMandate(mandateId!, {
      actorId: null,
      onlyProfileIds: [hidden!.id],
    });
    expect(r.considered).toBe(0);
    expect(r.proposed).toEqual([]);
  });

  it('excludes a candidate whose comp floor is above the mandate range (same currency)', async () => {
    // Find a mandate and a fresh candidate it would otherwise consider.
    for (const mandateId of await openMandateIds()) {
      const prep = await prepareMandate(mandateId);
      const profileId = Object.values(prep.refToProfile)[0];
      if (!profileId) continue;
      const [m] = await adminDb().select().from(mandates).where(eq(mandates.id, mandateId));
      if (!m!.compMax) continue;
      await adminDb()
        .update(candidateProfiles)
        .set({
          compFloor: await encryptJson(
            { amount: m!.compMax + 100_000, currency: m!.currency, basis: m!.compBasis },
            { aad: `candidate_profiles.comp_floor:${profileId}` },
          ),
        })
        .where(eq(candidateProfiles.id, profileId));
      const r = await proposeMatchesForMandate(mandateId, {
        actorId: null,
        onlyProfileIds: [profileId],
      });
      expect(r.considered).toBe(1);
      expect(r.proposed).toEqual([]);
      return;
    }
    throw new Error('no candidate available for the comp test');
  });

  it('refuses an unconfirmed mandate', async () => {
    const [m] = await adminDb()
      .select({ id: mandates.id })
      .from(mandates)
      .where(isNotNull(mandates.confirmedAt))
      .limit(1);
    await adminDb().update(mandates).set({ confirmedAt: null }).where(eq(mandates.id, m!.id));
    await expect(proposeMatchesForMandate(m!.id, { actorId: null })).rejects.toBeInstanceOf(
      MatchingError,
    );
    await adminDb().update(mandates).set({ confirmedAt: new Date() }).where(eq(mandates.id, m!.id));
  });

  it('links proposals to a paid search when given', async () => {
    for (const mandateId of await openMandateIds()) {
      const [search] = await adminDb()
        .insert(searches)
        .values({ mandateId, plan: 'ai_search', status: 'sourcing' })
        .returning({ id: searches.id });
      // Clear earlier proposals for this mandate so the run has something to propose.
      await adminDb()
        .delete(matches)
        .where(and(eq(matches.mandateId, mandateId), ne(matches.status, 'revealed')));
      const r = await proposeMatchesForMandate(mandateId, { actorId: null, searchId: search!.id });
      if (!r.proposed.length) continue;
      const rows = await adminDb()
        .select({ s: matches.searchId })
        .from(matches)
        .where(inArray(matches.id, r.proposed));
      expect(rows.every((x) => x.s === search!.id)).toBe(true);
      return;
    }
    throw new Error('no mandate produced proposals for the search test');
  });
});

describe('fairness report', () => {
  it('records a passing report that only staff can read', async () => {
    const r = await runFairnessReport();
    expect(r.passed).toBe(true);
    expect(r.metrics.minimumImpactRatio).toBeGreaterThanOrEqual(0.8);
    const talent = signInAs('talent') as Viewer;
    expect((await listFairnessReports(talent)).map((x) => x.id)).toContain(r.id);
    const employer = signInAs('employer') as Viewer;
    expect(await listFairnessReports(employer)).toEqual([]);
  });
});
