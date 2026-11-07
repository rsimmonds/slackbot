import 'server-only';
import {
  answerTurn,
  createSession,
  driverFor,
  drain,
  initialState,
  lastQuestion,
  loadSession,
  openingTurn,
  saveSession,
  SessionError,
  specFor,
  type AnySpec,
  type SessionEvent,
  type SessionKind,
  type SessionRecord,
} from '@cmobeat/ai/interview';
import { z } from 'zod';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { employerCompany } from '@/lib/jobs/posting';
import { completeMandateSession } from '@/lib/mandates/complete';

export { SessionError };

export const startInput = z.object({ kind: z.enum(['mandate', 'profile']) });
export const answerInput = z.object({
  answer: z.string().trim().min(1, 'Write an answer first.').max(4000),
});

export interface SessionView {
  id: string;
  ref: string;
  kind: SessionKind;
  intro: string;
  question: string | null;
  followUp: boolean;
  index: number;
  total: number;
  done: boolean;
  status: SessionRecord['status'];
  mandateId: string | null;
  profileId: string | null;
}

function requireSpec(kind: SessionKind): AnySpec {
  const spec = specFor(kind);
  if (!spec) throw new SessionError(`Interviews of kind "${kind}" are not available yet.`, 400);
  return spec;
}

function requireViewer(viewer: Viewer | null): asserts viewer is Viewer {
  if (!viewer) throw new SessionError('Sign in to continue.', 401);
}

export function toView(rec: SessionRecord, spec: AnySpec): SessionView {
  const q = lastQuestion(rec.state);
  return {
    id: rec.id,
    ref: `${spec.refPrefix}-${rec.ref.slice(0, 4)}`,
    kind: rec.kind,
    intro: spec.intro,
    question: rec.state.done ? null : (q?.text ?? null),
    followUp: q?.followUp ?? false,
    index: rec.state.questionIndex,
    total: spec.maxQuestions,
    done: rec.state.done || rec.status === 'complete',
    status: rec.status,
    mandateId: rec.mandateId,
    profileId: rec.profileId,
  };
}

/** Start an interview. Mandate sessions need an employer seat; profile sessions the candidate role. */
export async function startSession(viewer: Viewer | null, kind: SessionKind): Promise<SessionView> {
  requireViewer(viewer);
  const spec = requireSpec(kind);
  let companyId: string | null = null;
  if (kind === 'mandate') {
    if (!viewer.roles.includes('employer'))
      throw new SessionError('Mandate sessions are for employers.', 403);
    const company = await asViewer(viewer, (tx) => employerCompany(tx, viewer.id));
    if (!company) throw new SessionError('Join your company on CMO Beat first.', 403);
    companyId = company.id;
  } else if (!viewer.roles.includes('candidate')) {
    throw new SessionError('Profile sessions are for candidates.', 403);
  }
  const state = initialState(spec);
  await drain(openingTurn(spec, state, driverFor()));
  const rec = await asViewer(viewer, (tx) =>
    createSession(tx, spec, { ownerId: viewer.id, companyId, state }),
  );
  return toView(rec, spec);
}

async function load(viewer: Viewer, id: string) {
  const rec = await asViewer(viewer, (tx) => loadSession(tx, id));
  // Someone else's session reads exactly like a missing one.
  if (!rec || rec.ownerId !== viewer.id) throw new SessionError('Session not found.', 404);
  return { rec, spec: requireSpec(rec.kind) };
}

export async function getSession(viewer: Viewer | null, id: string): Promise<SessionView> {
  requireViewer(viewer);
  const { rec, spec } = await load(viewer, id);
  return toView(rec, spec);
}

// ------------------------------------------------------------------ rate limit (per instance)

const recent = new Map<string, number[]>();
const inFlight = new Set<string>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 60;

/**
 * One answer in flight per session, at most 60 an hour. In-memory, per instance; the database's
 * optimistic save (expected question index) is what guarantees correctness across instances.
 */
export function checkAnswerRate(sessionId: string, now = Date.now()) {
  if (inFlight.has(sessionId))
    throw new SessionError('Your last answer is still being read. One moment.', 429);
  const times = (recent.get(sessionId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= MAX_PER_WINDOW)
    throw new SessionError(
      'That is a lot of answers in an hour. Take a short break and come back.',
      429,
    );
  times.push(now);
  recent.set(sessionId, times);
  inFlight.add(sessionId);
}

export function releaseAnswer(sessionId: string) {
  inFlight.delete(sessionId);
}

export function resetAnswerRate() {
  recent.clear();
  inFlight.clear();
}

export type StreamEvent = SessionEvent | { type: 'error'; message: string; status: number };

/**
 * Take an answer and stream what happens next. State is loaded and saved in short transactions;
 * the model work in between holds no database connection.
 */
export async function* answerSession(
  viewer: Viewer | null,
  id: string,
  answer: string,
): AsyncGenerator<StreamEvent> {
  requireViewer(viewer);
  const { rec, spec } = await load(viewer, id);
  if (rec.status === 'complete' || rec.state.done)
    throw new SessionError('This session is already complete.', 409);
  checkAnswerRate(id);
  try {
    const expected = rec.questionIndex;
    for await (const event of answerTurn(spec, rec.state, answer, driverFor())) yield event;
    const saved = await asViewer(viewer, (tx) => saveSession(tx, spec, id, rec.state, expected));
    if (!saved)
      yield {
        type: 'error',
        status: 409,
        message: 'This session moved on in another window. Reload to continue from there.',
      };
  } finally {
    releaseAnswer(id);
  }
}

/** Finish a session and turn it into its output (a mandate for employers). */
export async function completeSession(
  viewer: Viewer | null,
  id: string,
): Promise<{ redirect: string; missing?: string[] }> {
  requireViewer(viewer);
  const { rec, spec } = await load(viewer, id);
  if (
    !rec.state.done &&
    rec.state.remaining.length > 0 &&
    rec.state.questionIndex < spec.maxQuestions
  )
    throw new SessionError(
      'A few questions are still open. Answer them, or save and come back.',
      409,
    );
  if (rec.kind === 'mandate') return completeMandateSession(viewer, rec, spec);
  throw new SessionError(`Completing ${rec.kind} sessions is not available yet.`, 400);
}
