import type { Role } from '@cmobeat/config';
import {
  adminDb,
  auditLog,
  candidateProfiles,
  companies,
  consents,
  dataRequests,
  files,
  interviewSessions,
  profileBlocklist,
  profileOutcomes,
  userRoles,
  users,
  withAnon,
  withUser,
} from '@cmobeat/db';
import { latestEmailTo } from '@cmobeat/email';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { GET as fileRoute } from '@/app/api/files/[id]/route';
import { POST as noticeRoute } from '@/app/api/profiles/ai-notice/route';
import { DELETE as unblockRoute, POST as blockRoute, GET as blocklistRoute } from '@/app/api/profiles/blocklist/route';
import { PUT as employerRoute } from '@/app/api/profiles/current-employer/route';
import { DELETE as cancelDeleteRoute, POST as deleteRoute } from '@/app/api/profiles/delete/route';
import { GET as exportGetRoute, POST as exportRoute } from '@/app/api/profiles/export/route';
import { GET as profileRoute } from '@/app/api/profiles/route';
import { GET as reviewGetRoute, POST as reviewRoute } from '@/app/api/profiles/review/route';
import { POST as uploadRoute } from '@/app/api/profiles/uploads/route';
import { PATCH as visibilityRoute } from '@/app/api/profiles/visibility/route';
import type { Viewer } from '@/lib/auth';
import { buildExport, runDataDeletions, runDataExports, runProfileRetention } from '@/lib/data-rights';
import { interviewContextFor } from '@/lib/profile/profile';
import { signFileToken } from '@/lib/storage/signed-url';
import { jsonRequest, signInAs } from './helpers';
import { createProfileSession, makePdf, otherCandidate, profileIdOf } from './profile-fixtures';
import { testAuth } from './setup';

const DAY = 86_400_000;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => ((await res.json()) as { data?: unknown; error?: string }) ;

function act(v: Viewer | null) {
  testAuth.viewer = v ? { ...v, roles: [...v.roles] } : null;
}

const resumeLines = [
  'Jordan Example',
  'jordan.example@example.com | +1 416 555 0199',
  '123 King Street West',
  'Chief Marketing Officer, 2019 - present',
  'Grew ARR from $8M to $20M in two years.',
  'I am 52 years old and a mother of two.',
  'Built a team of 30 across brand and demand.',
];

async function upload(purpose: string, bytes: Buffer, name = 'resume.pdf') {
  const form = new FormData();
  form.set('purpose', purpose);
  form.set('file', new File([new Uint8Array(bytes)], name, { type: 'application/pdf' }));
  return uploadRoute(new Request('http://localhost:3000/api/profiles/uploads', { method: 'POST', body: form }));
}

async function disposableCandidate(label: string): Promise<Viewer> {
  const id = crypto.randomUUID();
  const email = `${label}-${id.slice(0, 8)}@test.cmobeat.dev`;
  await adminDb().insert(users).values({ id, email, displayName: `Test ${label}` });
  await adminDb().insert(userRoles).values([{ userId: id, role: 'reader' }, { userId: id, role: 'candidate' }]);
  return { id, email, name: `Test ${label}`, roles: ['reader', 'candidate'] as Role[] };
}

let candidate: Viewer;
let candidateProfileId: string;

beforeAll(async () => {
  candidate = signInAs('candidate')!;
  candidateProfileId = await profileIdOf(candidate.id);
});

describe('uploads', () => {
  it('accepts a PDF, encrypts it at rest, and keeps only scrubbed text as interview context', async () => {
    act(candidate);
    const res = await upload('resume', makePdf(resumeLines));
    expect(res.status).toBe(201);
    const { data } = (await json(res)) as { data: { fileId: string; removed: string[]; pages: number } };
    expect(data.pages).toBe(1);
    expect(data.removed).toContain('age');

    const [row] = await adminDb().select().from(files).where(eq(files.id, data.fileId));
    expect(row!.content!.includes(Buffer.from('%PDF'))).toBe(false);
    expect(row!.filename.includes(Buffer.from('resume'))).toBe(false);

    const context = await interviewContextFor(candidate);
    expect(context).toContain('$8M to $20M');
    expect(context).toContain('team of 30');
    expect(context).not.toMatch(/example\.com|555|King Street|52 years|mother/);
  });

  it('rejects anything that is not a PDF, and files over 5 MB', async () => {
    act(candidate);
    expect((await upload('resume', Buffer.from('MZ\x90\x00 not a pdf'), 'resume.pdf')).status).toBe(415);
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 + 10)]);
    expect((await upload('resume', big)).status).toBe(413);
    expect((await upload('photo' as 'resume', makePdf(['x']))).status).toBe(400);
  });

  it('serves a file only to its owner, with a valid unexpired token', async () => {
    act(candidate);
    const { data } = (await json(await upload('linkedin_pdf', makePdf(['VP Marketing', 'Pipeline 2x'])))) as {
      data: { fileId: string };
    };
    const id = data.fileId;
    const ok = await fileRoute(new Request(`http://x/api/files/${id}?token=${signFileToken(id, candidate.id)}`), ctx(id));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toContain('no-store');
    expect(Buffer.from(await ok.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');

    const expired = signFileToken(id, candidate.id, 60, Date.now() - 10 * 60_000);
    expect((await fileRoute(new Request(`http://x/api/files/${id}?token=${expired}`), ctx(id))).status).toBe(404);
    expect((await fileRoute(new Request(`http://x/api/files/${id}?token=1.forged`), ctx(id))).status).toBe(404);

    for (const who of ['employer', 'talent', 'admin', 'reader'] as const) {
      const v = signInAs(who)!;
      // Even a correctly signed token for the other person, or the owner's own token, gets nothing.
      for (const token of [signFileToken(id, candidate.id), signFileToken(id, v.id)])
        expect((await fileRoute(new Request(`http://x/api/files/${id}?token=${token}`), ctx(id))).status).toBe(404);
    }
    act(null);
    expect((await fileRoute(new Request(`http://x/api/files/${id}?token=${signFileToken(id, candidate.id)}`), ctx(id))).status).toBe(404);
  });
});

describe('AI notice', () => {
  it('records the acknowledgement once and is candidate-only', async () => {
    act(candidate);
    const first = (await json(await noticeRoute())) as { data: { acknowledgedAt: string } };
    const second = (await json(await noticeRoute())) as { data: { acknowledgedAt: string } };
    expect(second.data.acknowledgedAt).toBe(first.data.acknowledgedAt);
    signInAs('employer');
    expect((await noticeRoute()).status).toBe(403);
  });
});

describe('review and approval', () => {
  it('requires a decision on every line, then saves only what was approved or edited', async () => {
    act(candidate);
    const sessionId = await createProfileSession(candidate.id);
    const draft = (await json(await reviewGetRoute(new Request(`http://x/api/profiles/review?session=${sessionId}`)))) as {
      data: { lines: { id: string; kind: string; value: unknown }[]; scrubbed: string[] };
    };
    const lines = draft.data.lines;
    expect(lines.map((l) => l.id)).toEqual(expect.arrayContaining(['role', 'headline', 'outcome:0', 'ideal.summary']));
    expect(draft.data.scrubbed).toEqual(['age']);

    // Missing decisions: refused.
    const partial = await reviewRoute(
      jsonRequest('/api/profiles/review', 'POST', { sessionId, decisions: [{ id: 'role', action: 'approve' }] }),
    );
    expect(partial.status).toBe(422);
    expect((await json(partial)).error).toMatch(/Every line needs a decision/);

    // Invalid edit: refused.
    const decisions = lines.map((l) => ({ id: l.id, action: 'approve' as 'approve' | 'edit' | 'remove', value: undefined as unknown }));
    const headline = decisions.find((d) => d.id === 'headline')!;
    headline.action = 'edit';
    headline.value = 'short';
    expect((await reviewRoute(jsonRequest('/api/profiles/review', 'POST', { sessionId, decisions }))).status).toBe(422);

    headline.value = 'CMO for growth-stage B2B software that needs a demand engine';
    decisions.find((d) => d.id === 'outcome:2')!.action = 'remove';
    const saved = await reviewRoute(jsonRequest('/api/profiles/review', 'POST', { sessionId, decisions }));
    expect(saved.status).toBe(200);
    expect((await json(saved)).data).toMatchObject({ edited: 1, removed: 1, outcomes: 2 });

    const [p] = await adminDb().select().from(candidateProfiles).where(eq(candidateProfiles.id, candidateProfileId));
    expect(p!.headline).toBe('CMO for growth-stage B2B software that needs a demand engine');
    expect(p!.visibility).toBe('hidden');
    expect((p!.idealMandate as { reportingLine: string }).reportingLine).toBe('CEO');
    const outs = await adminDb().select().from(profileOutcomes).where(eq(profileOutcomes.profileId, candidateProfileId));
    expect(outs.every((o) => o.candidateApprovedAt)).toBe(true);
    expect(outs.map((o) => o.value)).not.toContain('28% to 41%');
    const [s] = await adminDb().select().from(interviewSessions).where(eq(interviewSessions.id, sessionId));
    expect(s!.profileId).toBe(candidateProfileId);
  });

  it('a session can only be reviewed by its owner', async () => {
    const sessionId = await createProfileSession(candidate.id);
    const other = await otherCandidate(candidate.id);
    for (const v of [other, signInAs('talent')!, signInAs('admin')!, signInAs('employer')!]) {
      act(v);
      const res = await reviewGetRoute(new Request(`http://x/api/profiles/review?session=${sessionId}`));
      expect([403, 404]).toContain(res.status);
    }
  });

  it('asks for more when the interview has too few results', async () => {
    act(candidate);
    const thin = await createProfileSession(candidate.id, { level: 'cmo', outcomesByField: {} });
    expect((await reviewGetRoute(new Request(`http://x/api/profiles/review?session=${thin}`))).status).toBe(409);
  });
});

describe('visibility', () => {
  it('needs consent to widen, logs it, and narrows instantly', async () => {
    act(candidate);
    const patch = (body: unknown) => visibilityRoute(jsonRequest('/api/profiles/visibility', 'PATCH', body));
    expect((await patch({ visibility: 'anonymous' })).status).toBe(422);
    expect((await patch({ visibility: 'anonymous', consent: true })).status).toBe(200);
    const [c] = await adminDb()
      .select()
      .from(consents)
      .where(and(eq(consents.subjectUserId, candidate.id), eq(consents.kind, 'share')))
      .orderBy(desc(consents.createdAt))
      .limit(1);
    expect(c!.scope).toMatchObject({ visibility: 'anonymous', from: 'hidden' });

    // Talent partners now see the profile; employers still don't.
    const talent = signInAs('talent')!;
    const asTalent = await withUser({ userId: talent.id, roles: talent.roles }, (tx) =>
      tx.select({ id: candidateProfiles.id }).from(candidateProfiles).where(eq(candidateProfiles.id, candidateProfileId)),
    );
    expect(asTalent).toHaveLength(1);

    act(candidate);
    expect((await patch({ visibility: 'hidden' })).status).toBe(200);
    const open = await adminDb()
      .select()
      .from(consents)
      .where(and(eq(consents.subjectUserId, candidate.id), eq(consents.kind, 'share'), sql`${consents.withdrawnAt} is null`));
    expect(open).toHaveLength(0);
    const audits = await adminDb()
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.targetId, candidateProfileId));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['profile.visibility.widen', 'profile.visibility.narrow']));
  });
});

describe('blocklist', () => {
  it('keeps the current employer blocked and manages other companies', async () => {
    act(candidate);
    const list = (await json(await blocklistRoute())) as {
      data: { currentEmployer: { id: string } | null; blocked: { companyId: string; isCurrentEmployer: boolean }[] };
    };
    const current = list.data.currentEmployer!;
    expect(list.data.blocked.find((b) => b.companyId === current.id)?.isCurrentEmployer).toBe(true);
    expect((await unblockRoute(new Request(`http://x/api/profiles/blocklist?companyId=${current.id}`, { method: 'DELETE' }))).status).toBe(409);

    const [other] = await adminDb().select({ id: companies.id }).from(companies).where(ne(companies.id, current.id)).limit(1);
    expect((await blockRoute(jsonRequest('/api/profiles/blocklist', 'POST', { companyId: other!.id }))).status).toBe(201);
    expect((await blockRoute(jsonRequest('/api/profiles/blocklist', 'POST', { companyId: other!.id }))).status).toBe(201);
    const blocked = await adminDb().select().from(profileBlocklist).where(eq(profileBlocklist.profileId, candidateProfileId));
    expect(blocked.filter((b) => b.companyId === other!.id)).toHaveLength(1);
    expect((await unblockRoute(new Request(`http://x/api/profiles/blocklist?companyId=${other!.id}`, { method: 'DELETE' }))).status).toBe(200);

    // A new current employer is blocked automatically.
    const res = await employerRoute(jsonRequest('/api/profiles/current-employer', 'PUT', { companyId: other!.id }));
    const after = (await json(res)) as { data: { currentEmployer: { id: string } } };
    expect(after.data.currentEmployer.id).toBe(other!.id);
    await employerRoute(jsonRequest('/api/profiles/current-employer', 'PUT', { companyId: current.id }));
  });

  it('is never readable by employers, including the blocked company', async () => {
    const employer = signInAs('employer')!;
    const rows = await withUser({ userId: employer.id, roles: employer.roles }, (tx) =>
      tx.select().from(profileBlocklist).where(eq(profileBlocklist.profileId, candidateProfileId)),
    );
    expect(rows).toHaveLength(0);
  });
});

describe('a hidden profile is invisible to every other role (Phase 2 acceptance)', () => {
  beforeAll(async () => {
    await adminDb().update(candidateProfiles).set({ visibility: 'hidden' }).where(eq(candidateProfiles.id, candidateProfileId));
    act(candidate);
    await upload('resume', makePdf(resumeLines));
  });

  async function sees(v: Viewer | null) {
    const q = async (tx: Parameters<Parameters<typeof withAnon>[0]>[0]) => ({
      profile: (await tx.select({ id: candidateProfiles.id, ideal: candidateProfiles.idealMandate }).from(candidateProfiles).where(eq(candidateProfiles.id, candidateProfileId))).length,
      outcomes: (await tx.select({ id: profileOutcomes.id }).from(profileOutcomes).where(eq(profileOutcomes.profileId, candidateProfileId))).length,
      blocklist: (await tx.select({ id: profileBlocklist.id }).from(profileBlocklist).where(eq(profileBlocklist.profileId, candidateProfileId))).length,
      files: (await tx.select({ id: files.id }).from(files).where(eq(files.ownerId, candidate.id))).length,
      sessions: (await tx.select({ id: interviewSessions.id }).from(interviewSessions).where(and(eq(interviewSessions.ownerId, candidate.id), eq(interviewSessions.kind, 'profile')))).length,
      requests: (await tx.select({ id: dataRequests.id }).from(dataRequests).where(eq(dataRequests.userId, candidate.id))).length,
    });
    if (!v) return withAnon(q);
    return withUser({ userId: v.id, roles: v.roles }, async (tx) => {
      try {
        return await tx.transaction((sp) => q(sp as never));
      } catch {
        // Permission denied (no grant at all) also means "sees nothing".
        return { profile: 0, outcomes: 0, blocklist: 0, files: 0, sessions: 0, requests: 0 };
      }
    });
  }

  it('the owner sees everything', async () => {
    const own = await sees(candidate);
    expect(own.profile).toBe(1);
    expect(own.outcomes).toBeGreaterThan(0);
    expect(own.files).toBeGreaterThan(0);
    expect(own.sessions).toBeGreaterThan(0);
  });

  it('anonymous, reader, another candidate, employer, editor, talent partner and admin see nothing', async () => {
    const others: [string, Viewer | null][] = [
      ['anonymous', null],
      ['reader', signInAs('reader')],
      ['another candidate', await otherCandidate(candidate.id)],
      ['employer', signInAs('employer')],
      ['editor', signInAs('editor')],
      ['talent partner', signInAs('talent')],
      ['admin', signInAs('admin')],
    ];
    for (const [label, v] of others) {
      const s = await sees(v);
      expect({ label, ...s }).toEqual({ label, profile: 0, outcomes: 0, blocklist: 0, files: 0, sessions: 0, requests: 0 });
    }
  });

  it('and nothing leaks through the profile APIs', async () => {
    for (const who of ['reader', 'employer', 'editor', 'talent', 'admin'] as const) {
      signInAs(who);
      const res = await profileRoute();
      // Non-candidates are refused; nobody ever gets another person's profile.
      expect(res.status).toBe(403);
      expect((await blocklistRoute()).status).toBe(403);
    }
    act(await otherCandidate(candidate.id));
    const theirs = (await json(await profileRoute())) as { data: { headline: string | null } };
    const [mine] = await adminDb().select({ headline: candidateProfiles.headline }).from(candidateProfiles).where(eq(candidateProfiles.id, candidateProfileId));
    expect(theirs.data.headline).not.toBe(mine!.headline);
  });

  it('talent partners never see identity, even on an anonymous profile', async () => {
    await adminDb().update(candidateProfiles).set({ visibility: 'anonymous' }).where(eq(candidateProfiles.id, candidateProfileId));
    const talent = signInAs('talent')!;
    const r = await withUser({ userId: talent.id, roles: talent.roles }, async (tx) => ({
      userRow: await tx.transaction(async (sp) => sp.select({ email: users.email }).from(users).where(eq(users.id, candidate.id))).catch(() => []),
      files: await tx.select({ id: files.id }).from(files).where(eq(files.ownerId, candidate.id)),
      sessions: await tx.select({ id: interviewSessions.id }).from(interviewSessions).where(and(eq(interviewSessions.ownerId, candidate.id), eq(interviewSessions.kind, 'profile'))),
    }));
    expect(r.userRow).toHaveLength(0);
    expect(r.files).toHaveLength(0);
    expect(r.sessions).toHaveLength(0);
    await adminDb().update(candidateProfiles).set({ visibility: 'hidden' }).where(eq(candidateProfiles.id, candidateProfileId));
  });
});

describe('data rights', () => {
  it('exports everything about the person, decrypted, and nothing about anyone else', async () => {
    act(candidate);
    expect((await exportRoute()).status).toBe(202);
    expect((await exportRoute()).status).toBe(202); // idempotent while pending
    const pending = await adminDb()
      .select()
      .from(dataRequests)
      .where(and(eq(dataRequests.userId, candidate.id), eq(dataRequests.kind, 'export'), eq(dataRequests.status, 'pending')));
    expect(pending).toHaveLength(1);

    const fileIds = await runDataExports();
    expect(fileIds.length).toBeGreaterThan(0);
    const mail = await latestEmailTo(candidate.email);
    expect(mail!.template).toBe('data-export-ready');

    const latest = (await json(await exportGetRoute())) as { data: { latest: { id: string; downloadUrl: string } } };
    const url = new URL(latest.data.latest.downloadUrl, 'http://x');
    const res = await fileRoute(new Request(url), ctx(latest.data.latest.id));
    expect(res.status).toBe(200);
    const archive = JSON.parse(Buffer.from(await res.arrayBuffer()).toString('utf8'));
    expect(archive.account.email).toBe(candidate.email);
    expect(archive.candidateProfile.uploadsAndContext).toContain('$8M to $20M');
    expect(archive.interviewSessions.length).toBeGreaterThan(0);
    const other = await otherCandidate(candidate.id);
    expect(JSON.stringify(archive)).not.toContain(other.email);

    // Nobody else can download it.
    signInAs('admin');
    expect((await fileRoute(new Request(url), ctx(latest.data.latest.id))).status).toBe(404);
  });

  it('delete: confirms, anonymizes immediately, can be cancelled in the grace window, then deletes for good', async () => {
    const v = await disposableCandidate('delete');
    act(v);
    await upload('resume', makePdf(['CMO', 'Grew pipeline 2x in a year.']));
    const sessionId = await createProfileSession(v.id);
    await reviewRoute(
      jsonRequest('/api/profiles/review', 'POST', {
        sessionId,
        decisions: (
          (await json(await reviewGetRoute(new Request(`http://x/api/profiles/review?session=${sessionId}`)))) as {
            data: { lines: { id: string }[] };
          }
        ).data.lines.map((l) => ({ id: l.id, action: 'approve' })),
      }),
    );

    expect((await deleteRoute(jsonRequest('/api/profiles/delete', 'POST', { confirm: 'yes' }))).status).toBe(422);
    expect((await deleteRoute(jsonRequest('/api/profiles/delete', 'POST', { confirm: 'delete' }))).status).toBe(202);

    const profileId = await profileIdOf(v.id);
    const [p] = await adminDb().select().from(candidateProfiles).where(eq(candidateProfiles.id, profileId));
    expect(p).toMatchObject({ visibility: 'hidden', headline: null, resumeRef: null, idealMandate: null });
    expect(await adminDb().select().from(profileOutcomes).where(eq(profileOutcomes.profileId, profileId))).toHaveLength(0);
    expect((await adminDb().select().from(files).where(eq(files.ownerId, v.id))).every((f) => f.deletedAt)).toBe(true);

    // Cancel during the grace window.
    expect((await json(await cancelDeleteRoute())).data).toEqual({ cancelled: true });
    await deleteRoute(jsonRequest('/api/profiles/delete', 'POST', { confirm: 'delete' }));

    // Not yet: inside the grace window.
    expect(await runDataDeletions({ now: new Date(Date.now() + 2 * DAY) })).toHaveLength(0);
    const done = await runDataDeletions({ now: new Date(Date.now() + 8 * DAY) });
    expect(done.find((d) => d.outcome === 'deleted')).toBeTruthy();
    expect(await adminDb().select().from(users).where(eq(users.id, v.id))).toHaveLength(0);
    expect(await adminDb().select().from(candidateProfiles).where(eq(candidateProfiles.userId, v.id))).toHaveLength(0);
    const [req] = await adminDb().select().from(dataRequests).where(and(eq(dataRequests.userId, v.id), eq(dataRequests.status, 'completed')));
    expect(req!.completedAt).toBeTruthy();
  });

  it('anonymizes inactive profiles after 24 months, but not sample data', async () => {
    const v = await disposableCandidate('stale');
    act(v);
    await upload('resume', makePdf(['VP Marketing', 'Cut CAC by 30%.']));
    const profileId = await profileIdOf(v.id);
    await adminDb()
      .update(candidateProfiles)
      .set({ headline: 'Stale headline for retention', lastActiveAt: new Date(Date.now() - 800 * DAY), updatedAt: new Date(Date.now() - 800 * DAY) })
      .where(eq(candidateProfiles.id, profileId));
    const sampleBefore = await adminDb().select({ n: sql<number>`count(*)::int` }).from(candidateProfiles).where(sql`${candidateProfiles.isSample} and ${candidateProfiles.headline} is not null`);
    const r = await runProfileRetention();
    expect(r.anonymized).toBeGreaterThanOrEqual(1);
    const [p] = await adminDb().select().from(candidateProfiles).where(eq(candidateProfiles.id, profileId));
    expect(p).toMatchObject({ headline: null, resumeRef: null, visibility: 'hidden' });
    const sampleAfter = await adminDb().select({ n: sql<number>`count(*)::int` }).from(candidateProfiles).where(sql`${candidateProfiles.isSample} and ${candidateProfiles.headline} is not null`);
    expect(sampleAfter[0]!.n).toBe(sampleBefore[0]!.n);
  });

  it('buildExport refuses unknown users', async () => {
    await expect(buildExport(crypto.randomUUID())).rejects.toThrow();
  });
});
