import { adminDb, humanQueue, interviewSessions, withUser } from '@cmobeat/db';
import { devUsers } from '@cmobeat/db/dev-users';
import { eq } from 'drizzle-orm';
import {
  answerTurn,
  createSession,
  drain,
  finish,
  initialState,
  liveDriver,
  loadSession,
  mandateSpec,
  offlineDriver,
  openingTurn,
  planNext,
  saveSession,
  specFor,
  type AnyState,
} from '../src/interview';
import { interviewSuites, runInterviewSuite } from '../src/interview/evals';
import { patchSchema } from '../src/interview/live';
import { systemPrompt } from '../src/prompts';
import { MandateDocumentSchema } from '../src/schemas/mandate';

process.env.INTERVIEW_STREAM_DELAY_MS = '0';

const employer = devUsers.find((u) => u.roles.includes('employer'))!;
const candidate = devUsers.find((u) => u.roles.includes('candidate'))!;
const asEmployer = <T>(fn: Parameters<typeof withUser<T>>[1]) =>
  withUser({ userId: employer.id, roles: employer.roles }, fn);

/** Good answers keyed by field, as a CEO might give them. */
const answers: Record<string, string> = {
  role: 'A full-time Chief Marketing Officer.',
  whyNow:
    'We closed our Series C and moved upmarket. Marketing is still built for SMB and the board wants a category leader.',
  reportingLine: 'The CEO, with a seat at the board meeting each quarter.',
  priorities:
    '- Reposition the brand for mid-market\n- Double marketing-sourced pipeline\n- Hire a head of product marketing',
  scorecard30: 'Met every exec and our top ten customers; a written diagnosis of the funnel',
  scorecard90: 'Pipeline plan approved by the board — measured by sourced pipeline',
  tensions:
    'The CRO will push for short-term leads over brand. The CEO decides when they disagree.',
  nonNegotiables: 'Has led a B2B repositioning; has run a team of 20 or more',
  teamSize: 'A team of 14 marketers.',
  location: 'New York, paid in US dollars.',
  comp: '$380k to $450k base.',
  interviewPlan:
    'CEO: vision and pace\nCRO: pipeline partnership\nBoard member: strategic judgement',
  risks: 'Budget is flat this year. The sales team is sceptical of marketing.',
};

async function runToEnd(state: AnyState, pick: (field: string) => string) {
  await drain(openingTurn(mandateSpec, state, offlineDriver));
  let guard = 0;
  while (!state.done && guard++ < 40) {
    const field = [...state.turns].reverse().find((t) => t.role === 'assistant')!.field!;
    await drain(answerTurn(mandateSpec, state, pick(field), offlineDriver));
  }
}

describe('interview engine', () => {
  it('asks one follow-up on a vague answer, then moves on', async () => {
    const state = initialState(mandateSpec);
    await drain(openingTurn(mandateSpec, state, offlineDriver));
    const e1 = await drain(answerTurn(mandateSpec, state, 'Not sure', offlineDriver));
    const q1 = e1.find((e) => e.type === 'question');
    expect(q1).toMatchObject({ followUp: true, index: 2 });
    const e2 = await drain(answerTurn(mandateSpec, state, 'Still not sure', offlineDriver));
    const q2 = e2.find((e) => e.type === 'question');
    expect(q2).toMatchObject({ followUp: false });
    expect(state.turns.at(-1)!.field).not.toBe('role');
    expect(planNext(mandateSpec, state, { field: 'role', vague: true })?.field).not.toBe('role');
  });

  it('streams the question token by token', async () => {
    const state = initialState(mandateSpec);
    const events = await drain(openingTurn(mandateSpec, state, offlineDriver));
    const tokens = events.filter((e) => e.type === 'token');
    expect(tokens.length).toBeGreaterThan(3);
    const q = events.find((e) => e.type === 'question');
    expect(q && 'text' in q && q.text).toBe(mandateSpec.fields[0]!.question);
  });

  it('completes a full session with good answers and validates the document', async () => {
    const state = initialState(mandateSpec);
    await runToEnd(state, (f) => answers[f]!);
    expect(state.done).toBe(true);
    expect(state.remaining).toEqual([]);
    expect(state.questionIndex).toBe(mandateSpec.fields.length);
    const result = finish(mandateSpec, state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toMatchObject({
        level: 'cmo',
        currency: 'USD',
        compMin: 380000,
        teamSize: 14,
      });
      expect(result.derived).toEqual([]);
    }
  });

  it('stops at the question limit even when answers stay vague', async () => {
    const state = initialState(mandateSpec);
    await runToEnd(state, () => 'Not sure');
    expect(state.done).toBe(true);
    expect(state.questionIndex).toBeLessThanOrEqual(mandateSpec.maxQuestions);
    expect(finish(mandateSpec, state)).toMatchObject({ ok: false });
  });

  it('rejects answers once the session is done', async () => {
    const state = initialState(mandateSpec);
    await runToEnd(state, (f) => answers[f]!);
    await expect(drain(answerTurn(mandateSpec, state, 'more', offlineDriver))).rejects.toThrow(
      /complete/,
    );
  });

  it('registers the mandate spec and nothing it does not know', () => {
    expect(specFor('mandate')).toBe(mandateSpec);
  });
});

describe('interview persistence', () => {
  async function newSession() {
    const state = initialState(mandateSpec);
    await drain(openingTurn(mandateSpec, state, offlineDriver));
    const companyId = await adminDb().query.employerMembers.findFirst({
      where: (m, { eq: e }) => e(m.userId, employer.id),
    });
    return asEmployer((tx) =>
      createSession(tx, mandateSpec, {
        ownerId: employer.id,
        companyId: companyId!.companyId,
        state,
      }),
    );
  }

  it('stores state encrypted and bound to the session id', async () => {
    const s = await newSession();
    expect(s.ref).toMatch(/^[0-9A-F]{8}$/);
    const [row] = await adminDb()
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, s.id));
    expect(row!.transcript).toBeInstanceOf(Buffer);
    expect(row!.transcript!.toString('utf8')).not.toContain('Chief Marketing');
    const loaded = await asEmployer((tx) => loadSession(tx, s.id));
    expect(loaded!.state.turns[0]!.text).toBe(mandateSpec.fields[0]!.question);

    // Moving the ciphertext to another session breaks decryption (AAD = session id).
    const other = await newSession();
    await adminDb()
      .update(interviewSessions)
      .set({ transcript: row!.transcript })
      .where(eq(interviewSessions.id, other.id));
    await expect(asEmployer((tx) => loadSession(tx, other.id))).rejects.toThrow();
  });

  it('refuses a stale save (two answers racing)', async () => {
    const s = await newSession();
    const state = s.state;
    await drain(answerTurn(mandateSpec, state, answers.role!, offlineDriver));
    expect(await asEmployer((tx) => saveSession(tx, mandateSpec, s.id, state, 1))).toBe(true);
    expect(await asEmployer((tx) => saveSession(tx, mandateSpec, s.id, state, 1))).toBe(false);
    const [row] = await adminDb()
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, s.id));
    expect(row!.draftOutput).toMatchObject({ level: 'cmo' });
  });

  it('is invisible to another user', async () => {
    const s = await newSession();
    const seen = await withUser({ userId: candidate.id, roles: candidate.roles }, (tx) =>
      loadSession(tx, s.id),
    );
    expect(seen).toBeNull();
  });
});

describe('live driver (offline-safe parts)', () => {
  it('builds a nullable patch schema with every output key', () => {
    const shape = patchSchema(mandateSpec).shape.patch.shape;
    expect(Object.keys(shape)).toEqual(Object.keys(MandateDocumentSchema.shape));
    expect(
      patchSchema(mandateSpec).safeParse({
        patch: Object.fromEntries(Object.keys(shape).map((k) => [k, null])),
        vague: true,
      }).success,
    ).toBe(true);
  });

  it('falls back to offline extraction (and queues for a human) when the model output is unusable', async () => {
    // The fake provider has no output for mandate-builder, so runAgent fails twice and queues.
    const before = await adminDb().select().from(humanQueue);
    const state = initialState(mandateSpec);
    await drain(openingTurn(mandateSpec, state, offlineDriver));
    const r = await liveDriver.absorb(mandateSpec, state, 'role', answers.role!);
    expect(r).toMatchObject({ vague: false, patch: { level: 'cmo' } });
    const after = await adminDb().select().from(humanQueue);
    expect(after.length).toBe(before.length + 1);
  });

  it('uses the Extract and Ask sections of one prompt file', () => {
    const extract = systemPrompt('mandate-builder', 'Extract').text;
    const ask = systemPrompt('mandate-builder', 'Ask').text;
    expect(extract).toContain('## Extract');
    expect(extract).not.toContain('## Ask');
    expect(ask).toContain('## Ask');
    expect(ask).toContain('protected attribute');
  });
});

describe('mandate builder evals (offline)', () => {
  it.each(interviewSuites.map((s) => [s.file, s] as const))('%s meets its threshold', (_f, def) => {
    const r = runInterviewSuite(def);
    expect(r.failures).toEqual([]);
    expect(r.total).toBeGreaterThanOrEqual(20);
    expect(r.ok).toBe(true);
  });
});
