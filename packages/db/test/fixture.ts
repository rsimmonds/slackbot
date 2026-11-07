import type { Db } from '../src/client';
import { encryptJson } from '../src/crypto';
import * as s from '../src/schema';

/**
 * Small, fixed-id fixture for RLS tests, added on top of the full sample seed.
 *
 *   candA  anonymous profile   — approved match with company X (visible to X, identity hidden)
 *   candB  hidden profile      — approved match with X, but hidden means nobody sees it
 *   candC  open profile        — approved match with X, but candC blocklists X
 *   candD  anonymous profile   — proposed match with X (not yet human-approved);
 *                                revealed match with Y whose reveal consent was withdrawn
 *   candA also has a revealed match with Y with a live reveal consent → Y sees identity
 */
const u = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const F = {
  users: {
    candA: u(1),
    candB: u(2),
    candC: u(3),
    candD: u(4),
    employerX: u(10),
    employerY: u(11),
    talent: u(20),
    editor: u(21),
    admin: u(22),
    reader: u(30),
  },
  companies: { X: u(100), Y: u(101) },
  profiles: { A: u(200), B: u(201), C: u(202), D: u(203) },
  mandates: { X: u(300), Y: u(301), XNoComp: u(302) },
  matches: { XA: u(400), XB: u(401), XC: u(402), XD: u(403), YA: u(404), YD: u(405) },
  consents: { revealA: u(500), revealD: u(501), applyA: u(502) },
  listings: { X: u(600) },
  articles: { published: u(700), draft: u(701) },
} as const;

export async function createFixture(db: Db): Promise<void> {
  const U = F.users;
  const userRows = [
    [U.candA, 'cand-a', ['reader', 'candidate']],
    [U.candB, 'cand-b', ['reader', 'candidate']],
    [U.candC, 'cand-c', ['reader', 'candidate']],
    [U.candD, 'cand-d', ['reader', 'candidate']],
    [U.employerX, 'employer-x', ['reader', 'employer']],
    [U.employerY, 'employer-y', ['reader', 'employer']],
    [U.talent, 'talent', ['reader', 'talent_partner']],
    [U.editor, 'editor', ['reader', 'editor']],
    [U.admin, 'admin', ['reader', 'admin']],
    [U.reader, 'reader', ['reader']],
  ] as const;

  await db.transaction(async (tx) => {
    await tx.insert(s.users).values(
      userRows.map(([id, name]) => ({
        id,
        email: `${name}@fixture.test`,
        displayName: `Fixture ${name}`,
      })),
    );
    await tx
      .insert(s.userRoles)
      .values(userRows.flatMap(([id, , roles]) => roles.map((role) => ({ userId: id, role }))));

    await tx.insert(s.companies).values([
      {
        id: F.companies.X,
        name: 'Fixture X',
        domain: 'x.fixture.test',
        industry: 'Test',
        stage: 'Test',
        sizeBand: '1-50',
        hqCountry: 'US',
        market: 'US',
      },
      {
        id: F.companies.Y,
        name: 'Fixture Y',
        domain: 'y.fixture.test',
        industry: 'Test',
        stage: 'Test',
        sizeBand: '1-50',
        hqCountry: 'DE',
        market: 'EU',
      },
    ]);
    await tx.insert(s.employerMembers).values([
      { userId: U.employerX, companyId: F.companies.X, seatRole: 'owner' },
      { userId: U.employerY, companyId: F.companies.Y, seatRole: 'owner' },
    ]);

    const P = F.profiles;
    await tx.insert(s.candidateProfiles).values([
      {
        id: P.A,
        userId: U.candA,
        visibility: 'anonymous',
        headline: 'Fixture A headline',
        level: 'cmo',
        yearsExperience: 18,
        contact: await encryptJson({ email: 'a@x' }, { aad: `candidate_profiles.contact:${P.A}` }),
      },
      {
        id: P.B,
        userId: U.candB,
        visibility: 'hidden',
        headline: 'Fixture B headline',
        level: 'cmo',
        yearsExperience: 20,
      },
      {
        id: P.C,
        userId: U.candC,
        visibility: 'open',
        headline: 'Fixture C headline',
        level: 'cmo',
        yearsExperience: 15,
      },
      {
        id: P.D,
        userId: U.candD,
        visibility: 'anonymous',
        headline: 'Fixture D headline',
        level: 'vp_marketing',
        yearsExperience: 12,
      },
    ]);
    await tx.insert(s.profileOutcomes).values([
      { profileId: P.A, outcomeType: 'revenue', metric: 'Pipeline', value: '+50%' },
      { profileId: P.B, outcomeType: 'revenue', metric: 'Pipeline', value: '+70%' },
    ]);
    await tx.insert(s.profileBlocklist).values({ profileId: P.C, companyId: F.companies.X });

    const M = F.mandates;
    const mandateBase = {
      source: 'builder' as const,
      title: 'CMO',
      level: 'cmo' as const,
      currency: 'USD' as const,
      workType: 'full_time' as const,
      compBasis: 'annual' as const,
    };
    await tx.insert(s.mandates).values([
      {
        ...mandateBase,
        id: M.X,
        companyId: F.companies.X,
        compMin: 300_000,
        compMax: 400_000,
        market: 'US',
      },
      {
        ...mandateBase,
        id: M.Y,
        companyId: F.companies.Y,
        compMin: 250_000,
        compMax: 350_000,
        currency: 'EUR',
        market: 'EU',
      },
      { ...mandateBase, id: M.XNoComp, companyId: F.companies.X, market: 'US' },
    ]);
    await tx.insert(s.listings).values({ id: F.listings.X, mandateId: M.X, status: 'draft' });

    const reviewed = { reviewedBy: U.talent, reviewedAt: new Date() };
    const MM = F.matches;
    await tx.insert(s.matches).values([
      {
        id: MM.XA,
        mandateId: M.X,
        profileId: P.A,
        scoreLow: 0.7,
        scoreHigh: 0.85,
        rationale: { summary: 'A fits X' },
        status: 'approved',
        ...reviewed,
      },
      {
        id: MM.XB,
        mandateId: M.X,
        profileId: P.B,
        scoreLow: 0.6,
        scoreHigh: 0.8,
        rationale: { summary: 'B fits X' },
        status: 'approved',
        ...reviewed,
      },
      {
        id: MM.XC,
        mandateId: M.X,
        profileId: P.C,
        scoreLow: 0.65,
        scoreHigh: 0.8,
        rationale: { summary: 'C fits X' },
        status: 'approved',
        ...reviewed,
      },
      {
        id: MM.XD,
        mandateId: M.X,
        profileId: P.D,
        scoreLow: 0.5,
        scoreHigh: 0.7,
        rationale: { summary: 'D fits X' },
        status: 'proposed',
      },
      {
        id: MM.YA,
        mandateId: M.Y,
        profileId: P.A,
        scoreLow: 0.75,
        scoreHigh: 0.9,
        rationale: { summary: 'A fits Y' },
        status: 'revealed',
        ...reviewed,
      },
      {
        id: MM.YD,
        mandateId: M.Y,
        profileId: P.D,
        scoreLow: 0.6,
        scoreHigh: 0.75,
        rationale: { summary: 'D fits Y' },
        status: 'revealed',
        ...reviewed,
      },
    ]);

    const C = F.consents;
    await tx.insert(s.consents).values([
      {
        id: C.revealA,
        subjectUserId: U.candA,
        kind: 'reveal',
        scope: { company: 'Fixture Y', fields: ['name', 'email', 'headline'] },
      },
      {
        id: C.revealD,
        subjectUserId: U.candD,
        kind: 'reveal',
        scope: { company: 'Fixture Y' },
        withdrawnAt: new Date(),
      },
      { id: C.applyA, subjectUserId: U.candA, kind: 'apply', scope: { listing: F.listings.X } },
    ]);
    await tx.insert(s.revealRequests).values([
      {
        matchId: MM.YA,
        requestedBy: U.employerY,
        candidateDecision: 'accepted',
        decidedAt: new Date(),
        consentId: C.revealA,
      },
      {
        matchId: MM.YD,
        requestedBy: U.employerY,
        candidateDecision: 'accepted',
        decidedAt: new Date(),
        consentId: C.revealD,
      },
    ]);

    await tx.insert(s.interviewSessions).values([
      { ownerId: U.candA, kind: 'profile', status: 'active' },
      { ownerId: U.employerX, kind: 'mandate', companyId: F.companies.X, status: 'active' },
    ]);

    await tx.insert(s.articles).values([
      {
        id: F.articles.published,
        slug: 'fixture-published',
        type: 'story',
        title: 'Published',
        bodyMdx: 'x',
        authorId: U.editor,
        editorId: U.editor,
        status: 'published',
        publishedAt: new Date(),
      },
      {
        id: F.articles.draft,
        slug: 'fixture-draft',
        type: 'story',
        title: 'Draft',
        bodyMdx: 'x',
        authorId: U.editor,
        status: 'draft',
      },
    ]);
    await tx
      .insert(s.auditLog)
      .values({ actorId: U.talent, action: 'match.approve', targetType: 'match', targetId: MM.XA });
  });
}
