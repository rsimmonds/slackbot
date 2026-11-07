import { adminDb, auditLog, interviewSessions, mandates } from '@cmobeat/db';
import { and, eq } from 'drizzle-orm';
import { extractText, getDocumentProxy } from 'unpdf';
import { POST as startRoute } from '@/app/api/sessions/route';
import { GET as getRoute } from '@/app/api/sessions/[id]/route';
import { POST as answerRoute } from '@/app/api/sessions/[id]/answer/route';
import { POST as completeRoute } from '@/app/api/sessions/[id]/complete/route';
import { GET as pdfRoute } from '@/app/api/mandates/[id]/pdf/route';
import { computeBenchmark, percentile } from '@/lib/mandates/benchmark';
import { confirmMandate, confirmProblems, getMandate, saveMandate } from '@/lib/mandates/document';
import { readEditForm } from '@/lib/mandates/form';
import { checkAnswerRate, resetAnswerRate } from '@/lib/sessions/service';
import type { Viewer } from '@/lib/auth';
import { jsonRequest, signInAs } from './helpers';

process.env.INTERVIEW_STREAM_DELAY_MS = '0';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const answers: Record<string, string> = {
  role: 'A full-time Chief Marketing Officer.',
  whyNow:
    'We closed our Series C and moved upmarket. Marketing is still built for SMB and the board wants a category leader.',
  reportingLine: 'The CEO.',
  priorities:
    '- Reposition the brand for mid-market\n- Double marketing-sourced pipeline\n- Hire a head of product marketing',
  scorecard30: 'Met every exec and our top ten customers; a written diagnosis of the funnel',
  scorecard90: 'Pipeline plan approved by the board — measured by sourced pipeline',
  tensions: 'The CRO will push for short-term leads over brand. The CEO decides.',
  nonNegotiables: 'Has led a B2B repositioning; has run a team of 20 or more',
  teamSize: 'A team of 14 marketers.',
  location: 'New York, paid in US dollars.',
  comp: '$380k to $450k base.',
  interviewPlan:
    'CEO: vision and pace\nCRO: pipeline partnership\nBoard member: strategic judgement',
  risks: 'Budget is flat this year. Sales is sceptical of marketing.',
};

type Ev = {
  type: string;
  text?: string;
  index?: number;
  complete?: boolean;
  message?: string;
  status?: number;
};

async function events(res: Response): Promise<Ev[]> {
  const body = await res.text();
  return body
    .split('\n\n')
    .map((b) => b.split('\n').find((l) => l.startsWith('data:')))
    .filter(Boolean)
    .map((l) => JSON.parse(l!.slice(5)) as Ev);
}

async function start(kind = 'mandate') {
  const res = await startRoute(jsonRequest('/api/sessions', 'POST', { kind }));
  return {
    res,
    body: (await res.json()) as {
      data?: { id: string; index: number; question: string; ref: string };
      error?: string;
    },
  };
}

async function answer(id: string, text: string) {
  resetAnswerRate();
  return answerRoute(jsonRequest(`/api/sessions/${id}/answer`, 'POST', { answer: text }), ctx(id));
}

/** Answer every question with the matching good answer until the session ends. */
async function runToEnd(id: string) {
  for (let i = 0; i < 20; i++) {
    const [row] = await adminDb()
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, id));
    const view = (await (await getRoute(new Request('http://x'), ctx(id))).json()) as {
      data: { done: boolean };
    };
    if (view.data.done) return;
    // The field is not exposed by the API; pick the answer whose question we are on.
    const q = (await (await getRoute(new Request('http://x'), ctx(id))).json()) as {
      data: { question: string };
    };
    const field = Object.keys(answers).find((k) => questionFor(k) === q.data.question)!;
    expect(
      field,
      `unknown question at index ${row!.questionIndex}: ${q.data.question}`,
    ).toBeTruthy();
    const evs = await events(await answer(id, answers[field]!));
    expect(evs.find((e) => e.type === 'error')).toBeUndefined();
  }
}

const { mandateSpec } = await import('@cmobeat/ai/interview');
const questionFor = (key: string) => mandateSpec.fields.find((f) => f.key === key)!.question;

describe('sessions API', () => {
  beforeEach(() => resetAnswerRate());

  it('lets an employer start a mandate session and resume it', async () => {
    signInAs('employer');
    const { res, body } = await start();
    expect(res.status).toBe(201);
    expect(body.data).toMatchObject({ index: 1, question: questionFor('role') });
    expect(body.data!.ref).toMatch(/^MB-[0-9A-F]{4}$/);
    const resumed = await (await getRoute(new Request('http://x'), ctx(body.data!.id))).json();
    expect(resumed.data).toMatchObject({ id: body.data!.id, index: 1, done: false });
  });

  it('enforces roles and registered kinds', async () => {
    signInAs('candidate');
    expect((await start('mandate')).res.status).toBe(403);
    expect((await start('profile')).res.status).toBe(201);
    signInAs('employer');
    expect((await start('profile')).res.status).toBe(403);
    signInAs('reader');
    expect((await start('mandate')).res.status).toBe(403);
    signInAs(null);
    expect((await start('mandate')).res.status).toBe(401);
    signInAs('employer');
    expect((await start('nonsense')).res.status).toBe(400);
  });

  it('hides a session from everyone but its owner', async () => {
    signInAs('employer');
    const { body } = await start();
    const id = body.data!.id;
    for (const who of ['candidate', 'admin', 'talent'] as const) {
      signInAs(who);
      expect((await getRoute(new Request('http://x'), ctx(id))).status).toBe(404);
      expect((await answer(id, 'hello there friend')).status).toBe(404);
      expect(
        (await completeRoute(new Request('http://x', { method: 'POST' }), ctx(id))).status,
      ).toBe(404);
    }
  });

  it('streams thinking, tokens and the next question', async () => {
    signInAs('employer');
    const { body } = await start();
    const res = await answer(body.data!.id, answers.role!);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const evs = await events(res);
    expect(evs[0]!.type).toBe('thinking');
    expect(evs.filter((e) => e.type === 'token').length).toBeGreaterThan(2);
    expect(evs.at(-1)).toMatchObject({ type: 'question', index: 2, text: questionFor('whyNow') });
  });

  it('follows up once on a vague answer', async () => {
    signInAs('employer');
    const { body } = await start();
    const evs = await events(await answer(body.data!.id, 'Not sure'));
    expect(evs.at(-1)).toMatchObject({ type: 'question', followUp: true });
  });

  it('validates answers and rate-limits rapid ones', async () => {
    signInAs('employer');
    const { body } = await start();
    const id = body.data!.id;
    const empty = await answerRoute(
      jsonRequest(`/api/sessions/${id}/answer`, 'POST', { answer: '  ' }),
      ctx(id),
    );
    expect(empty.status).toBe(400);
    resetAnswerRate();
    checkAnswerRate(id);
    const tooFast = await answerRoute(
      jsonRequest(`/api/sessions/${id}/answer`, 'POST', { answer: answers.role }),
      ctx(id),
    );
    expect(tooFast.status).toBe(429);
  });

  it('refuses to complete an unfinished session', async () => {
    signInAs('employer');
    const { body } = await start();
    const res = await completeRoute(
      new Request('http://x', { method: 'POST' }),
      ctx(body.data!.id),
    );
    expect(res.status).toBe(409);
  });

  it('runs a full session into an unconfirmed mandate with a data benchmark', async () => {
    const viewer = signInAs('employer') as unknown as Viewer;
    const { body } = await start();
    const id = body.data!.id;
    await runToEnd(id);
    const res = await completeRoute(new Request('http://x', { method: 'POST' }), ctx(id));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { redirect: string } };
    const mandateId = data.redirect.split('/').at(-1)!;

    const [row] = await adminDb().select().from(mandates).where(eq(mandates.id, mandateId));
    expect(row).toMatchObject({
      source: 'builder',
      level: 'cmo',
      currency: 'USD',
      compMin: 380000,
      compMax: 450000,
      confirmedAt: null,
    });
    expect((row!.scorecard as { items: unknown[] }).items.length).toBeGreaterThanOrEqual(3);
    expect(row!.compBenchmark).toMatchObject({ currency: 'USD', basis: 'annual', level: 'cmo' });

    const [s] = await adminDb()
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, id));
    expect(s).toMatchObject({ status: 'complete', mandateId });
    const audits = await adminDb()
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.targetId, mandateId), eq(auditLog.action, 'mandate.session_completed')),
      );
    expect(audits).toHaveLength(1);

    // Re-completing updates the same mandate instead of creating another.
    const again = await completeRoute(new Request('http://x', { method: 'POST' }), ctx(id));
    expect(((await again.json()) as { data: { redirect: string } }).data.redirect).toBe(
      data.redirect,
    );

    // Confirm (amber), then any edit clears the confirmation.
    await confirmMandate(viewer, mandateId);
    expect((await getMandate(viewer, mandateId))!.confirmedAt).toBeInstanceOf(Date);
    const fd = new FormData();
    const m = (await getMandate(viewer, mandateId))!;
    for (const [k, v] of Object.entries({
      title: 'Chief Marketing Officer, North America',
      level: m.doc.level,
      workType: m.doc.workType,
      market: m.doc.market,
      currency: m.doc.currency,
      reportingLine: m.doc.reportingLine,
      teamSize: String(m.doc.teamSize ?? ''),
      summary: m.doc.summary,
      priorities: m.doc.priorities.join('\n'),
      tensions: '',
      nonNegotiables: '',
      risks: '',
      compMin: '400,000',
      compMax: '470000',
    }))
      fd.set(k, v);
    m.doc.scorecard.forEach((r, i) => {
      fd.set(`scorecard.${i}.outcome`, r.outcome);
      fd.set(`scorecard.${i}.measure`, r.measure);
      fd.set(`scorecard.${i}.byDay`, String(r.byDay));
    });
    m.doc.interviewPlan.forEach((r, i) => {
      fd.set(`interviewPlan.${i}.stage`, r.stage);
      fd.set(`interviewPlan.${i}.interviewer`, r.interviewer);
      fd.set(`interviewPlan.${i}.tests`, r.tests.join('\n'));
    });
    await saveMandate(viewer, mandateId, readEditForm(fd));
    const edited = (await getMandate(viewer, mandateId))!;
    expect(edited).toMatchObject({
      confirmedAt: null,
      doc: { title: 'Chief Marketing Officer, North America', compMin: 400000 },
    });
  });

  it('blocks confirmation without a comp range and explains why', async () => {
    const viewer = signInAs('employer') as unknown as Viewer;
    const { body } = await start();
    await runToEnd(body.data!.id);
    const done = (await (
      await completeRoute(new Request('http://x', { method: 'POST' }), ctx(body.data!.id))
    ).json()) as { data: { redirect: string } };
    const id = done.data.redirect.split('/').at(-1)!;
    await adminDb()
      .update(mandates)
      .set({ compMin: null, compMax: null })
      .where(eq(mandates.id, id));
    const m = (await getMandate(viewer, id))!;
    expect(confirmProblems(m.doc).join(' ')).toMatch(/compensation range/i);
    await expect(confirmMandate(viewer, id)).rejects.toThrow(/compensation range/i);
  });

  it('exports a PDF to the company and staff, and to no one else', async () => {
    signInAs('employer');
    const { body } = await start();
    await runToEnd(body.data!.id);
    const done = (await (
      await completeRoute(new Request('http://x', { method: 'POST' }), ctx(body.data!.id))
    ).json()) as { data: { redirect: string } };
    const id = done.data.redirect.split('/').at(-1)!;

    const res = await pdfRoute(new Request('http://x'), ctx(id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(5000);
    if (process.env.PDF_OUT) (await import('node:fs')).writeFileSync(process.env.PDF_OUT, bytes);
    const { text } = await extractText(await getDocumentProxy(bytes.slice()), { mergePages: true });
    // Tracked (letter-spaced) labels extract with gaps between characters; compare without spaces.
    const flat = String(text).replace(/\s+/g, '');
    expect(flat).toContain('ChiefMarketingOfficer');
    expect(flat).toContain('Confidential—preparedwithCMOBeat');
    expect(flat).toContain('90-dayscorecard');

    signInAs('admin');
    expect((await pdfRoute(new Request('http://x'), ctx(id))).status).toBe(200);
    signInAs('candidate');
    expect((await pdfRoute(new Request('http://x'), ctx(id))).status).toBe(404);
    signInAs(null);
    expect((await pdfRoute(new Request('http://x'), ctx(id))).status).toBe(401);
  });
});

describe('comp benchmark', () => {
  it('interpolates percentiles like percentile_cont', () => {
    expect(percentile([100, 200, 300, 400], 0.5)).toBe(250);
    expect(percentile([100, 200, 300, 400, 500], 0.25)).toBe(200);
  });

  it('says "not enough data" instead of guessing', async () => {
    const b = await computeBenchmark({
      level: 'fractional_cmo',
      market: 'UK',
      currency: 'GBP',
      basis: 'monthly_retainer',
    });
    if (b.n < 5) expect(b).toMatchObject({ enough: false, median: null, p25: null, p75: null });
    else expect(b.median).not.toBeNull();
  });

  it('computes from comparable listings only (same currency and basis)', async () => {
    const b = await computeBenchmark({
      level: 'cmo',
      market: 'US',
      currency: 'USD',
      basis: 'annual',
    });
    expect(b.method).toMatch(/listings/);
    if (b.enough) {
      expect(b.p25!).toBeLessThanOrEqual(b.median!);
      expect(b.median!).toBeLessThanOrEqual(b.p75!);
    }
  });
});
