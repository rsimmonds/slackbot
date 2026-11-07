import type { Role } from '@cmobeat/config';
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { adminDb, closeDb, withAnon, withUser } from '../src/client';
import * as s from '../src/schema';
import { F } from './fixture';
import { as, CHECK_VIOLATION, expectPgError, INSUFFICIENT_PRIVILEGE } from './helpers';

const U = F.users;
afterAll(closeDb);

const profileIds = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('candidate profiles', () => {
  it('(a) a candidate reads only their own profile', async () => {
    const rows = await as(U.candA, ['reader', 'candidate'], (tx) =>
      tx.select().from(s.candidateProfiles),
    );
    expect(profileIds(rows)).toEqual([F.profiles.A]);
  });

  it('(a) a candidate cannot edit another profile', async () => {
    const updated = await as(U.candA, ['candidate'], (tx) =>
      tx
        .update(s.candidateProfiles)
        .set({ headline: 'pwned' })
        .where(eq(s.candidateProfiles.id, F.profiles.B))
        .returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it('(b) an employer sees no candidate rows in any candidate table', async () => {
    await as(U.employerX, ['reader', 'employer'], async (tx) => {
      expect(await tx.select().from(s.candidateProfiles)).toHaveLength(0);
      expect(await tx.select().from(s.profileOutcomes)).toHaveLength(0);
      expect(await tx.select().from(s.profileBlocklist)).toHaveLength(0);
      const sessions = await tx.select().from(s.interviewSessions);
      expect(sessions.every((x) => x.kind === 'mandate' && x.ownerId === U.employerX)).toBe(true);
      expect(await tx.select().from(s.matches)).toHaveLength(0);
      expect(await tx.select().from(s.users).where(eq(s.users.id, U.candA))).toHaveLength(0);
    });
  });

  it('(b) employers have no grant on embeddings', async () => {
    await expectPgError(
      as(U.employerX, ['employer'], (tx) => tx.select().from(s.embeddings)),
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('(f) a hidden profile is invisible to every role except its owner', async () => {
    const seen = async (userId: string, roles: Parameters<typeof as>[1]) =>
      as(userId, roles, (tx) =>
        tx.select().from(s.candidateProfiles).where(eq(s.candidateProfiles.id, F.profiles.B)),
      );

    expect(await seen(U.candB, ['candidate'])).toHaveLength(1);
    for (const [id, roles] of [
      [U.candA, ['candidate']],
      [U.employerX, ['employer']],
      [U.talent, ['talent_partner']],
      [U.editor, ['editor']],
      [U.admin, ['admin']],
      [U.reader, ['reader']],
    ] as const) {
      expect(
        await seen(id, [...roles]),
        `${roles[0]} should not see a hidden profile`,
      ).toHaveLength(0);
    }
    expect(await withAnon((tx) => tx.select().from(s.candidateProfiles))).toHaveLength(0);

    const outcomes = await as(U.talent, ['talent_partner'], (tx) =>
      tx.select().from(s.profileOutcomes).where(eq(s.profileOutcomes.profileId, F.profiles.B)),
    );
    expect(outcomes).toHaveLength(0);
  });

  it('(f) talent partners see anonymous and open profiles only', async () => {
    const rows = await as(U.talent, ['talent_partner'], (tx) =>
      tx.select().from(s.candidateProfiles),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.visibility !== 'hidden')).toBe(true);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(F.profiles.A);
    expect(ids).toContain(F.profiles.C);
    expect(ids).not.toContain(F.profiles.B);
  });
});

describe('forged roles', () => {
  it('a role claimed in app.roles but absent from user_roles grants nothing', async () => {
    await as(U.reader, ['admin', 'talent_partner', 'editor'], async (tx) => {
      expect(await tx.select().from(s.candidateProfiles)).toHaveLength(0);
      expect(await tx.select().from(s.users)).toHaveLength(1);
      expect(await tx.select().from(s.auditLog)).toHaveLength(0);
      const drafts = await tx.select().from(s.articles).where(eq(s.articles.status, 'draft'));
      expect(drafts).toHaveLength(0);
    });
  });

  it('a role held in user_roles but not claimed for this request is not used', async () => {
    const rows = await as(U.talent, ['reader'], (tx) => tx.select().from(s.candidateProfiles));
    expect(rows).toHaveLength(0);
  });

  it('withUser rejects malformed contexts', async () => {
    await expect(
      withUser({ userId: 'not-a-uuid', roles: ['reader'] }, async () => 1),
    ).rejects.toThrow();
    const forged = ['superuser'] as unknown as Role[];
    await expect(withUser({ userId: U.reader, roles: forged }, async () => 1)).rejects.toThrow();
  });
});

describe('employer_match_view', () => {
  const view = (userId: string) =>
    as(userId, ['reader', 'employer'], (tx) =>
      tx.execute<Record<string, unknown>>(sql`select * from employer_match_view order by match_id`),
    );

  it('(c) shows only approved matches for the employer’s company, without identity', async () => {
    const rows = [...(await view(U.employerX))];
    // XA approved → visible. XB hidden profile → excluded. XC blocklisted X → excluded. XD proposed → excluded.
    expect(rows.map((r) => r.match_id)).toEqual([F.matches.XA]);
    const [row] = rows;
    expect(row!.identity_revealed).toBe(false);
    expect(row!.profile_id).toBeNull();
    expect(row!.candidate_name).toBeNull();
    expect(row!.candidate_email).toBeNull();
    expect(row!.headline).toBeNull();
    expect(row!.rationale).toEqual({ summary: 'A fits X' });
  });

  it('(c) reveals identity only with an accepted, unwithdrawn reveal consent', async () => {
    const rows = [...(await view(U.employerY))];
    const byId = Object.fromEntries(rows.map((r) => [r.match_id as string, r]));
    expect(Object.keys(byId).sort()).toEqual([F.matches.YA, F.matches.YD].sort());
    expect(byId[F.matches.YA]!.identity_revealed).toBe(true);
    expect(byId[F.matches.YA]!.candidate_name).toBe('Fixture cand-a');
    expect(byId[F.matches.YA]!.profile_id).toBe(F.profiles.A);
    // candD withdrew consent: still listed, identity gone.
    expect(byId[F.matches.YD]!.identity_revealed).toBe(false);
    expect(byId[F.matches.YD]!.candidate_name).toBeNull();
  });

  it('(c) withdrawing consent hides identity immediately', async () => {
    await as(U.candA, ['candidate'], (tx) =>
      tx
        .update(s.consents)
        .set({ withdrawnAt: new Date() })
        .where(eq(s.consents.id, F.consents.revealA)),
    );
    const rows = [...(await view(U.employerY))];
    expect(rows.find((r) => r.match_id === F.matches.YA)!.candidate_name).toBeNull();
    await adminDb()
      .update(s.consents)
      .set({ withdrawnAt: null })
      .where(eq(s.consents.id, F.consents.revealA));
  });

  it('(c) is empty for non-employers, even with the employer role claimed falsely', async () => {
    const rows = await as(U.talent, ['employer', 'talent_partner'], (tx) =>
      tx.execute(sql`select * from employer_match_view`),
    );
    expect([...rows]).toHaveLength(0);
    expect([
      ...(await withAnon((tx) => tx.execute(sql`select * from employer_match_view`))),
    ]).toHaveLength(0);
  });

  it('(c) an employer can request a reveal for a visible approved match, not a blocklisted one', async () => {
    const ok = await as(U.employerX, ['employer'], (tx) =>
      tx
        .insert(s.revealRequests)
        .values({ matchId: F.matches.XA, requestedBy: U.employerX })
        .returning(),
    );
    expect(ok).toHaveLength(1);
    await expectPgError(
      as(U.employerX, ['employer'], (tx) =>
        tx.insert(s.revealRequests).values({ matchId: F.matches.XC, requestedBy: U.employerX }),
      ),
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('an employer cannot accept a reveal on the candidate’s behalf', async () => {
    const updated = await as(U.employerX, ['employer'], (tx) =>
      tx
        .update(s.revealRequests)
        .set({ candidateDecision: 'accepted', consentId: F.consents.revealA })
        .where(eq(s.revealRequests.matchId, F.matches.XA))
        .returning(),
    );
    expect(updated).toHaveLength(0);
  });
});

describe('public content', () => {
  it('(d) anonymous visitors read published articles but not drafts', async () => {
    const rows = await withAnon((tx) =>
      tx.select({ id: s.articles.id, status: s.articles.status }).from(s.articles),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === 'published')).toBe(true);
    expect(rows.map((r) => r.id)).toContain(F.articles.published);
    expect(rows.map((r) => r.id)).not.toContain(F.articles.draft);
  });

  it('(d) anonymous visitors see live listings, approved moves, companies and bylines only', async () => {
    await withAnon(async (tx) => {
      const listings = await tx.select().from(s.listings);
      expect(listings.every((l) => l.status === 'live')).toBe(true);
      const moves = await tx.select().from(s.moves);
      expect(moves.every((m) => m.status === 'approved')).toBe(true);
      expect((await tx.select().from(s.companies)).length).toBeGreaterThanOrEqual(40);
      expect(await tx.select().from(s.users)).toHaveLength(0);
      const bylines = [...(await tx.execute(sql`select * from public_bylines`))];
      expect(bylines.length).toBeGreaterThan(0);
      expect(Object.keys(bylines[0]!)).toEqual(['id', 'display_name']);
      // Mandates behind a draft listing stay private.
      expect(
        await tx.select().from(s.mandates).where(eq(s.mandates.id, F.mandates.X)),
      ).toHaveLength(0);
    });
  });

  it('editors see drafts', async () => {
    const rows = await as(U.editor, ['editor'], (tx) =>
      tx.select().from(s.articles).where(eq(s.articles.id, F.articles.draft)),
    );
    expect(rows).toHaveLength(1);
  });
});

describe('audit_log', () => {
  it('(e) app_user can append as itself', async () => {
    await as(U.candA, ['candidate'], (tx) =>
      tx.insert(s.auditLog).values({
        actorId: U.candA,
        action: 'profile.view',
        targetType: 'profile',
        targetId: F.profiles.A,
      }),
    );
  });

  it('(e) app_user cannot append as someone else', async () => {
    await expectPgError(
      as(U.candA, ['candidate'], (tx) =>
        tx.insert(s.auditLog).values({ actorId: U.talent, action: 'x', targetType: 'x' }),
      ),
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('(e) app_user cannot update or delete', async () => {
    await expectPgError(
      as(U.admin, ['admin'], (tx) => tx.update(s.auditLog).set({ action: 'edited' })),
      INSUFFICIENT_PRIVILEGE,
    );
    await expectPgError(
      as(U.admin, ['admin'], (tx) => tx.delete(s.auditLog)),
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('(e) even the owner cannot update, delete or truncate', async () => {
    await expectPgError(
      adminDb().update(s.auditLog).set({ action: 'edited' }),
      INSUFFICIENT_PRIVILEGE,
    );
    await expectPgError(adminDb().delete(s.auditLog), INSUFFICIENT_PRIVILEGE);
    await expectPgError(adminDb().execute(sql`truncate audit_log`), INSUFFICIENT_PRIVILEGE);
  });

  it('only talent partners and admins read it', async () => {
    expect(
      (await as(U.talent, ['talent_partner'], (tx) => tx.select().from(s.auditLog))).length,
    ).toBeGreaterThan(0);
    expect(await as(U.employerX, ['employer'], (tx) => tx.select().from(s.auditLog))).toHaveLength(
      0,
    );
    expect(await as(U.candA, ['candidate'], (tx) => tx.select().from(s.auditLog))).toHaveLength(0);
  });
});

describe('integrity rules', () => {
  it('employers cannot publish a listing themselves', async () => {
    const updated = await as(U.employerX, ['employer'], (tx) =>
      tx
        .update(s.listings)
        .set({ status: 'live', publishedAt: new Date(), expiresAt: new Date(Date.now() + 864e5) })
        .where(eq(s.listings.id, F.listings.X))
        .returning(),
    ).catch((e) => e);
    expect(updated instanceof Error || (Array.isArray(updated) && updated.length === 0)).toBe(true);
    const [row] = await adminDb().select().from(s.listings).where(eq(s.listings.id, F.listings.X));
    expect(row!.status).toBe('draft');
  });

  it('employers cannot create a listing against another company’s mandate', async () => {
    await expectPgError(
      as(U.employerX, ['employer'], (tx) =>
        tx.insert(s.listings).values({ mandateId: F.mandates.Y, status: 'draft' }),
      ),
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('a listing cannot go live without a comp range', async () => {
    await expectPgError(
      adminDb().insert(s.listings).values({
        mandateId: F.mandates.XNoComp,
        status: 'live',
        publishedAt: new Date(),
        expiresAt: new Date(),
      }),
      CHECK_VIOLATION,
    );
  });

  it('a move needs at least one source', async () => {
    await expectPgError(
      adminDb().insert(s.moves).values({
        personName: 'Nobody',
        companyId: F.companies.X,
        moveType: 'appointed',
        title: 'CMO',
        effectiveDate: '2026-01-01',
        sources: [],
      }),
      CHECK_VIOLATION,
    );
  });

  it('a published article needs an editor', async () => {
    await expectPgError(
      adminDb().insert(s.articles).values({
        slug: 'no-editor',
        type: 'story',
        title: 'x',
        bodyMdx: 'x',
        authorId: U.editor,
        status: 'published',
        publishedAt: new Date(),
      }),
      CHECK_VIOLATION,
    );
  });

  it('applications need the candidate’s own apply consent', async () => {
    await expectPgError(
      as(U.candB, ['candidate'], (tx) =>
        tx.insert(s.applications).values({
          listingId: F.listings.X,
          profileId: F.profiles.B,
          consentId: F.consents.applyA,
        }),
      ),
      INSUFFICIENT_PRIVILEGE,
    );
    const [app] = await as(U.candA, ['candidate'], (tx) =>
      tx
        .insert(s.applications)
        .values({ listingId: F.listings.X, profileId: F.profiles.A, consentId: F.consents.applyA })
        .returning(),
    );
    expect(app).toBeDefined();
  });

  it('a candidate cannot advance their own application', async () => {
    await expectPgError(
      as(U.candA, ['candidate'], (tx) =>
        tx
          .update(s.applications)
          .set({ status: 'advanced' })
          .where(
            and(
              eq(s.applications.listingId, F.listings.X),
              eq(s.applications.profileId, F.profiles.A),
            ),
          ),
      ),
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('only a talent partner can approve a match, and only in their own name', async () => {
    const byEmployer = await as(U.employerX, ['employer'], (tx) =>
      tx
        .update(s.matches)
        .set({ status: 'approved' })
        .where(eq(s.matches.id, F.matches.XD))
        .returning(),
    );
    expect(byEmployer).toHaveLength(0);
    await expectPgError(
      as(U.talent, ['talent_partner'], (tx) =>
        tx
          .update(s.matches)
          .set({ status: 'approved', reviewedBy: U.admin, reviewedAt: new Date() })
          .where(eq(s.matches.id, F.matches.XD)),
      ),
      INSUFFICIENT_PRIVILEGE,
    );
    const ok = await as(U.talent, ['talent_partner'], (tx) =>
      tx
        .update(s.matches)
        .set({ status: 'approved', reviewedBy: U.talent, reviewedAt: new Date() })
        .where(eq(s.matches.id, F.matches.XD))
        .returning(),
    );
    expect(ok).toHaveLength(1);
    await adminDb()
      .update(s.matches)
      .set({ status: 'proposed', reviewedBy: null, reviewedAt: null })
      .where(eq(s.matches.id, F.matches.XD));
  });

  it('a talent partner cannot mark a match revealed (only the consent flow can)', async () => {
    await expectPgError(
      as(U.talent, ['talent_partner'], (tx) =>
        tx
          .update(s.matches)
          .set({ status: 'revealed', reviewedBy: U.talent })
          .where(eq(s.matches.id, F.matches.XA)),
      ),
      INSUFFICIENT_PRIVILEGE,
    );
  });
});

describe('staff_bylines', () => {
  it('shows colleague names to staff and nothing to anyone else', async () => {
    const { sql } = await import('drizzle-orm');
    const count = async (ctx: { userId: string; roles: Role[] }) =>
      withUser(
        ctx,
        async (tx) =>
          (await tx.execute(sql`select count(*)::int as n from staff_bylines`))[0]!.n as number,
      );
    expect(await count({ userId: U.editor, roles: ['editor'] })).toBeGreaterThan(0);
    expect(await count({ userId: U.employerX, roles: ['employer'] })).toBe(0);
    expect(await count({ userId: U.reader, roles: ['reader'] })).toBe(0);
  });
});

describe('matching (Phase 3)', () => {
  const MM = F.matches;
  const candidateView = (userId: string, roles: Role[] = ['candidate']) =>
    as(userId, roles, async (tx) => [
      ...(await tx.execute<Record<string, unknown>>(
        sql`select * from candidate_match_view order by match_id`,
      )),
    ]);

  it('a candidate cannot change a match status, only their own response', async () => {
    await expectPgError(
      as(U.candA, ['candidate'], (tx) =>
        tx.update(s.matches).set({ status: 'revealed' }).where(eq(s.matches.id, MM.XA)),
      ),
      INSUFFICIENT_PRIVILEGE,
    );
    const answered = await as(U.candA, ['candidate'], (tx) =>
      tx
        .update(s.matches)
        .set({ candidateResponse: 'interested', candidateRespondedAt: new Date() })
        .where(eq(s.matches.id, MM.XA))
        .returning({ id: s.matches.id, status: s.matches.status }),
    );
    expect(answered).toEqual([{ id: MM.XA, status: 'approved' }]);
    // Someone else's match: no rows touched.
    const other = await as(U.candA, ['candidate'], (tx) =>
      tx
        .update(s.matches)
        .set({ candidateResponse: 'declined' })
        .where(eq(s.matches.id, MM.XB))
        .returning(),
    );
    expect(other).toHaveLength(0);
  });

  it('a talent partner cannot answer a match for the candidate', async () => {
    await expectPgError(
      as(U.talent, ['talent_partner'], (tx) =>
        tx.update(s.matches).set({ candidateResponse: 'declined' }).where(eq(s.matches.id, MM.XA)),
      ),
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('the candidate view hides the company until reveal, and never shows blocklisted companies', async () => {
    const rows = await candidateView(U.candA);
    const byId = Object.fromEntries(rows.map((r) => [r.match_id as string, r]));
    expect(byId[MM.XA]!.company_name).toBeNull();
    expect(byId[MM.XA]!.company_industry).toBeTruthy();
    expect(byId[MM.YA]!.company_name).toBeTruthy(); // revealed
    // candC blocklists X: the approved X match never appears.
    expect((await candidateView(U.candC)).map((r) => r.match_id)).not.toContain(MM.XC);
    // Not a candidate, or someone else: nothing.
    expect(await candidateView(U.employerX, ['employer'])).toHaveLength(0);
    expect(await candidateView(U.talent, ['talent_partner', 'candidate'])).toHaveLength(0);
  });

  it('accepting a reveal with live consent reveals identity to that employer only', async () => {
    const [request] = await as(U.employerX, ['employer'], (tx) =>
      tx
        .insert(s.revealRequests)
        .values({ matchId: MM.XA, requestedBy: U.employerX })
        .returning({ id: s.revealRequests.id }),
    );
    const [consent] = await adminDb()
      .insert(s.consents)
      .values({ subjectUserId: U.candA, kind: 'reveal', scope: { matchId: MM.XA } })
      .returning({ id: s.consents.id });
    await as(U.candA, ['candidate'], (tx) =>
      tx
        .update(s.revealRequests)
        .set({ candidateDecision: 'accepted', consentId: consent!.id, decidedAt: new Date() })
        .where(eq(s.revealRequests.id, request!.id)),
    );
    const [match] = await adminDb()
      .select({ status: s.matches.status })
      .from(s.matches)
      .where(eq(s.matches.id, MM.XA));
    expect(match!.status).toBe('revealed');
    const employerRows = await as(U.employerX, ['employer'], (tx) =>
      tx.execute<Record<string, unknown>>(
        sql`select * from employer_match_view where match_id = ${MM.XA}`,
      ),
    );
    expect([...employerRows][0]!.candidate_name).toBe('Fixture cand-a');
    // Company Y employer still cannot see the X match.
    const yRows = await as(U.employerY, ['employer'], (tx) =>
      tx.execute(sql`select * from employer_match_view where match_id = ${MM.XA}`),
    );
    expect([...yRows]).toHaveLength(0);

    // Restore the fixture.
    await adminDb().delete(s.revealRequests).where(eq(s.revealRequests.id, request!.id));
    await adminDb().update(s.matches).set({ status: 'approved' }).where(eq(s.matches.id, MM.XA));
    await adminDb().delete(s.consents).where(eq(s.consents.id, consent!.id));
  });

  it('an employer can request a paid search only for its own confirmed mandate', async () => {
    await adminDb()
      .update(s.mandates)
      .set({ confirmedAt: new Date() })
      .where(eq(s.mandates.id, F.mandates.X));
    const ok = await as(U.employerX, ['employer'], (tx) =>
      tx.insert(s.searches).values({ mandateId: F.mandates.X, plan: 'ai_search' }).returning(),
    );
    expect(ok).toHaveLength(1);
    await expectPgError(
      as(U.employerX, ['employer'], (tx) =>
        tx.insert(s.searches).values({ mandateId: F.mandates.Y, plan: 'ai_search' }),
      ),
      INSUFFICIENT_PRIVILEGE,
    );
    await adminDb().delete(s.searches).where(eq(s.searches.id, ok[0]!.id));
  });

  it('fairness reports are visible to staff only', async () => {
    await adminDb()
      .insert(s.fairnessReports)
      .values({
        agent: 'matcher',
        periodStart: new Date(Date.now() - 7 * 864e5),
        periodEnd: new Date(),
        passed: true,
        metrics: {},
      });
    const staff = await as(U.talent, ['talent_partner'], (tx) =>
      tx.select().from(s.fairnessReports),
    );
    expect(staff.length).toBeGreaterThan(0);
    const employer = await as(U.employerX, ['employer'], (tx) =>
      tx.select().from(s.fairnessReports),
    );
    expect(employer).toHaveLength(0);
  });
});
