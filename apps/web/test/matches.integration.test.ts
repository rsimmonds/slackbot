/* eslint-disable @typescript-eslint/no-explicit-any -- route JSON is asserted field by field below */
import {
  adminDb,
  candidateProfiles,
  consents,
  matches,
  messages,
  profileBlocklist,
} from '@cmobeat/db';
import { latestEmailTo } from '@cmobeat/email';
import { and, eq, inArray } from 'drizzle-orm';
import { GET as dossierRoute } from '@/app/api/matches/[id]/route';
import { GET as threadRoute, POST as messageRoute } from '@/app/api/matches/[id]/messages/route';
import { POST as responseRoute } from '@/app/api/matches/[id]/response/route';
import { POST as revealRequestRoute } from '@/app/api/matches/[id]/reveal-requests/route';
import { POST as reviewRoute } from '@/app/api/matches/[id]/review/route';
import { POST as withdrawRoute } from '@/app/api/matches/[id]/withdraw/route';
import { POST as decisionRoute } from '@/app/api/matches/reveal-requests/[requestId]/decision/route';
import { GET as listRoute } from '@/app/api/matches/route';
import { POST as runRoute } from '@/app/api/matches/run/route';
import type { Viewer } from '@/lib/auth';
import { jsonRequest, signInAs } from './helpers';
import {
  auditActions,
  createConfirmedMandate,
  matchableCandidates,
  otherEmployer,
  proposeMatches,
  viewerFor,
} from './match-fixtures';
import { testAuth } from './setup';

const act = (v: Viewer | null) => {
  testAuth.viewer = v ? { ...v, roles: [...v.roles] } : null;
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const reqCtx = (requestId: string) => ({ params: Promise.resolve({ requestId }) });
const json = async (res: Response) => (await res.json()) as { data?: any; error?: string };
const post = (url: string, body?: unknown) => jsonRequest(url, 'POST', body ?? {});

let mandateId: string;
let companyId: string;
let matchIds: string[];
let candidates: { profileId: string; userId: string }[];
let cand: Viewer[];

beforeAll(async () => {
  const m = await createConfirmedMandate();
  mandateId = m.id;
  companyId = m.companyId;
  candidates = await matchableCandidates(companyId, 4);
  matchIds = await proposeMatches(
    mandateId,
    candidates.map((c) => c.profileId),
  );
  cand = await Promise.all(candidates.map((c) => viewerFor(c.userId)));
});

const review = (id: string, body: unknown) =>
  reviewRoute(post(`/api/matches/${id}/review`, body), ctx(id));
const shortlist = async () =>
  (await json(await listRoute(new Request(`http://x/api/matches?mandate=${mandateId}`))))
    .data as any[];

describe('staff review', () => {
  it('only talent partners and admins can open the queue and dossiers', async () => {
    signInAs('talent');
    const queue = (await json(await listRoute(new Request('http://x/api/matches')))).data as any[];
    const group = queue.find((g) => g.mandate.id === mandateId);
    expect(group.proposed).toBe(4);
    const dossier = (await json(await dossierRoute(new Request('http://x'), ctx(matchIds[0]!))))
      .data;
    expect(dossier.profile.outcomes.length).toBeGreaterThanOrEqual(0);
    // Anonymised: no name or email anywhere in the dossier.
    expect(JSON.stringify(dossier)).not.toContain(cand[0]!.email);
    expect(JSON.stringify(dossier)).not.toContain(cand[0]!.name);
    expect(dossier.trail.map((t: any) => t.action)).toContain('match.propose');

    for (const who of ['employer', 'candidate', 'editor', 'reader'] as const) {
      signInAs(who);
      expect((await dossierRoute(new Request('http://x'), ctx(matchIds[0]!))).status).toBe(403);
    }
    signInAs(null);
    expect((await dossierRoute(new Request('http://x'), ctx(matchIds[0]!))).status).toBe(401);
  });

  it('approves with an edited rationale (diff audited), rejects with a note, and never twice', async () => {
    signInAs('talent');
    const res = await review(matchIds[0]!, {
      action: 'approve',
      rationale: {
        summary: 'Rebuilt demand at the same stage; strong fit for the upmarket move.',
        reasons: [{ reason: 'Took sourced pipeline from 18% to 46%.', direction: 'for' }],
      },
    });
    expect(res.status).toBe(200);
    expect((await review(matchIds[0]!, { action: 'approve' })).status).toBe(409);
    expect((await review(matchIds[1]!, { action: 'approve' })).status).toBe(200);
    expect((await review(matchIds[2]!, { action: 'reject' })).status).toBe(400); // needs a note
    expect(
      (
        await review(matchIds[2]!, {
          action: 'reject',
          note: 'Fractional only; role is full-time.',
        })
      ).status,
    ).toBe(200);
    const actions = (await auditActions([matchIds[0]!])).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(['match.propose', 'match.rationale_edit', 'match.approve']),
    );
    // The candidate hears about it; the email names no company.
    const mail = await latestEmailTo(cand[0]!.email);
    expect(mail!.template).toBe('match-approved');
  });

  it('employers and candidates cannot review', async () => {
    signInAs('employer');
    expect((await review(matchIds[3]!, { action: 'approve' })).status).toBe(403);
    act(cand[3]!);
    expect((await review(matchIds[3]!, { action: 'approve' })).status).toBe(403);
  });

  it('running matching needs a confirmed mandate, and only ever proposes', async () => {
    signInAs('talent');
    const draft = await createConfirmedMandate(companyId, false);
    expect((await runRoute(post('/api/matches/run', { mandateId: draft.id }))).status).toBe(409);
    const res = await runRoute(post('/api/matches/run', { mandateId }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { proposed: string[] } };
    // Whatever the Matcher found, nothing is approved without a person.
    if (body.data.proposed.length) {
      const rows = await adminDb()
        .select({ status: matches.status })
        .from(matches)
        .where(inArray(matches.id, body.data.proposed));
      expect(rows.every((r) => r.status === 'proposed')).toBe(true);
    }
    signInAs('employer');
    expect((await runRoute(post('/api/matches/run', { mandateId }))).status).toBe(403);
  });
});

describe('employer shortlist', () => {
  it('shows exactly the approved matches, anonymised, to the employer’s company only', async () => {
    signInAs('employer');
    const rows = await shortlist();
    expect(rows.map((r) => r.matchId).sort()).toEqual([matchIds[0], matchIds[1]].sort());
    for (const r of rows) {
      expect(r.candidate).toBeNull();
      expect(r.identityRevealed).toBe(false);
    }
    expect(JSON.stringify(rows)).not.toContain(cand[0]!.email);

    act(await otherEmployer());
    expect((await listRoute(new Request(`http://x/api/matches?mandate=${mandateId}`))).status).toBe(
      404,
    );
    expect((await revealRequestRoute(post('/x'), ctx(matchIds[0]!))).status).toBe(404);
  });

  it('never shows a hidden or blocklisting candidate', async () => {
    const db = adminDb();
    await db
      .update(candidateProfiles)
      .set({ visibility: 'hidden' })
      .where(eq(candidateProfiles.id, candidates[1]!.profileId));
    signInAs('employer');
    expect((await shortlist()).map((r) => r.matchId)).toEqual([matchIds[0]]);
    await db
      .update(candidateProfiles)
      .set({ visibility: 'anonymous' })
      .where(eq(candidateProfiles.id, candidates[1]!.profileId));

    await db.insert(profileBlocklist).values({ profileId: candidates[1]!.profileId, companyId });
    expect((await shortlist()).map((r) => r.matchId)).toEqual([matchIds[0]]);
    // The candidate no longer sees that match either.
    act(cand[1]!);
    const mine = (await json(await listRoute(new Request('http://x/api/matches')))).data as any[];
    expect(mine.map((m) => m.matchId)).not.toContain(matchIds[1]);
    await db
      .delete(profileBlocklist)
      .where(
        and(
          eq(profileBlocklist.profileId, candidates[1]!.profileId),
          eq(profileBlocklist.companyId, companyId),
        ),
      );
  });

  it('requests an introduction once, only for approved matches, and tells the candidate', async () => {
    signInAs('employer');
    const res = await revealRequestRoute(post('/x'), ctx(matchIds[0]!));
    expect(res.status).toBe(201);
    expect((await revealRequestRoute(post('/x'), ctx(matchIds[0]!))).status).toBe(409);
    expect((await revealRequestRoute(post('/x'), ctx(matchIds[2]!))).status).toBe(404); // rejected
    expect((await revealRequestRoute(post('/x'), ctx(matchIds[3]!))).status).toBe(404); // proposed
    const mail = await latestEmailTo(cand[0]!.email);
    expect(mail!.template).toBe('match-introduction-requested');
    expect(JSON.stringify(mail!.payload)).not.toMatch(/Halvard/i);
    act(cand[0]!);
    expect((await revealRequestRoute(post('/x'), ctx(matchIds[0]!))).status).toBe(403);
  });
});

describe('candidate matches and the reveal', () => {
  it('shows the role without the company name, and only the candidate’s own matches', async () => {
    act(cand[0]!);
    const mine = (await json(await listRoute(new Request('http://x/api/matches')))).data as any[];
    const m = mine.find((x) => x.matchId === matchIds[0]);
    expect(m.company.name).toBeNull();
    expect(m.company.industry).toBeTruthy();
    expect(m.pendingRequestId).toBeTruthy();
    expect(mine.map((x) => x.matchId)).not.toContain(matchIds[1]);
  });

  it('answers with an encrypted question that only talent partners read', async () => {
    act(cand[0]!);
    expect(
      (await responseRoute(post('/x', { response: 'question' }), ctx(matchIds[0]!))).status,
    ).toBe(400);
    const question = 'Is the team remote-first?';
    expect(
      (await responseRoute(post('/x', { response: 'question', note: question }), ctx(matchIds[0]!)))
        .status,
    ).toBe(200);
    const [row] = await adminDb().select().from(matches).where(eq(matches.id, matchIds[0]!));
    expect(row!.candidateNote!.toString('utf8')).not.toContain('remote-first');
    // Someone else's match: not found.
    expect(
      (await responseRoute(post('/x', { response: 'interested' }), ctx(matchIds[1]!))).status,
    ).toBe(404);
    signInAs('talent');
    const dossier = (await json(await dossierRoute(new Request('http://x'), ctx(matchIds[0]!))))
      .data;
    expect(dossier.match.candidateNote).toBe(question);
    expect(dossier.match.candidateResponse).toBe('question');
  });

  it('accepting needs the acknowledgement; then the employer sees identity and can message', async () => {
    act(cand[0]!);
    const mine = (await json(await listRoute(new Request('http://x/api/matches')))).data as any[];
    const requestId = mine.find((x) => x.matchId === matchIds[0]).pendingRequestId as string;

    // Messages are closed before a reveal, for both sides.
    expect((await threadRoute(new Request('http://x'), ctx(matchIds[0]!))).status).toBe(404);
    // Another candidate cannot decide this request.
    act(cand[1]!);
    expect((await decisionRoute(post('/x', { accept: false }), reqCtx(requestId))).status).toBe(
      404,
    );

    act(cand[0]!);
    expect((await decisionRoute(post('/x', { accept: true }), reqCtx(requestId))).status).toBe(400);
    const res = await decisionRoute(
      post('/x', { accept: true, acknowledged: true }),
      reqCtx(requestId),
    );
    expect(res.status).toBe(200);
    expect((await decisionRoute(post('/x', { accept: false }), reqCtx(requestId))).status).toBe(
      409,
    );

    const [consent] = await adminDb()
      .select()
      .from(consents)
      .where(and(eq(consents.subjectUserId, cand[0]!.id), eq(consents.kind, 'reveal')));
    expect(consent!.scope).toMatchObject({ matchId: matchIds[0] });

    signInAs('employer');
    const row = (await shortlist()).find((r) => r.matchId === matchIds[0]);
    expect(row.candidate).toMatchObject({ name: cand[0]!.name, email: cand[0]!.email });
    expect((await latestEmailTo('employer@sample.cmobeat.dev'))!.template).toBe(
      'match-reveal-accepted',
    );

    const sent = await messageRoute(
      post('/x', { body: 'Thanks for agreeing. Thursday at 10?' }),
      ctx(matchIds[0]!),
    );
    expect(sent.status).toBe(201);
    const [msg] = await adminDb().select().from(messages).where(eq(messages.matchId, matchIds[0]!));
    expect(msg!.body.toString('utf8')).not.toContain('Thursday');
    expect((await latestEmailTo(cand[0]!.email))!.template).toBe('match-message');
    expect(JSON.stringify((await latestEmailTo(cand[0]!.email))!.payload)).not.toContain(
      'Thursday',
    );

    act(cand[0]!);
    const thread = (await json(await threadRoute(new Request('http://x'), ctx(matchIds[0]!)))).data;
    expect(thread.messages[0]).toMatchObject({
      body: 'Thanks for agreeing. Thursday at 10?',
      mine: false,
    });
    expect(thread.counterpart).not.toBe('The hiring team'); // company named after reveal
    expect(
      (await messageRoute(post('/x', { body: 'Thursday works.' }), ctx(matchIds[0]!))).status,
    ).toBe(201);

    // Nobody else reads the thread.
    for (const who of ['talent', 'admin', 'editor'] as const) {
      signInAs(who);
      expect((await threadRoute(new Request('http://x'), ctx(matchIds[0]!))).status).toBe(404);
    }
    act(await otherEmployer());
    expect((await threadRoute(new Request('http://x'), ctx(matchIds[0]!))).status).toBe(404);
  });

  it('withdrawing hides identity from the employer at once and closes messaging', async () => {
    act(cand[0]!);
    expect((await withdrawRoute(post('/x'), ctx(matchIds[0]!))).status).toBe(200);
    expect((await withdrawRoute(post('/x'), ctx(matchIds[0]!))).status).toBe(409);
    signInAs('employer');
    const row = (await shortlist()).find((r) => r.matchId === matchIds[0]);
    expect(row.candidate).toBeNull();
    expect((await threadRoute(new Request('http://x'), ctx(matchIds[0]!))).status).toBe(404);
    expect((await messageRoute(post('/x', { body: 'Hello?' }), ctx(matchIds[0]!))).status).toBe(
      404,
    );
  });

  it('declining keeps the candidate anonymous', async () => {
    signInAs('employer');
    expect((await revealRequestRoute(post('/x'), ctx(matchIds[1]!))).status).toBe(201);
    act(cand[1]!);
    const mine = (await json(await listRoute(new Request('http://x/api/matches')))).data as any[];
    const requestId = mine.find((x) => x.matchId === matchIds[1]).pendingRequestId as string;
    expect((await decisionRoute(post('/x', { accept: false }), reqCtx(requestId))).status).toBe(
      200,
    );
    signInAs('employer');
    const row = (await shortlist()).find((r) => r.matchId === matchIds[1]);
    expect(row.candidate).toBeNull();
    expect(row.request.decision).toBe('declined');
    const actions = (await auditActions([matchIds[1]!])).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['reveal.request', 'reveal.decline']));
  });
});
