import { decryptJson, encryptJson, interviewSessions, type Tx } from '@cmobeat/db';
import { and, eq } from 'drizzle-orm';
import type { InterviewSpec, SessionKind, SessionState, Turn } from './types';

/**
 * Adaptive interview engine (spec 7.1.3). One question at a time; one follow-up per vague answer;
 * stops at maxQuestions or when every field is complete; sessions save and resume.
 *
 * Model work sits behind a Driver (offline fallback or the Claude API). Persistence runs inside the
 * caller's transaction (asViewer), so row-level security decides who can read or write a session.
 * Session state is always encrypted at rest and bound to the session id.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySpec = InterviewSpec<any, any>;
export type AnyState = SessionState<Record<string, unknown>>;

export interface Absorbed {
  /** Draft fields learned from the answer. */
  patch: Record<string, unknown>;
  /** True when the answer was too vague to use for the field it answered. */
  vague: boolean;
}

export interface Driver {
  /** Learn from an answer to the question about `field`. */
  absorb(spec: AnySpec, state: AnyState, field: string, answer: string): Promise<Absorbed>;
  /** Phrase the question for `field` (a follow-up when `followUp`), streamed token by token. */
  ask(spec: AnySpec, state: AnyState, field: string, followUp: boolean): AsyncIterable<string>;
}

export type SessionEvent =
  | { type: 'thinking' }
  | { type: 'token'; text: string }
  | { type: 'question'; text: string; index: number; total: number; followUp: boolean }
  | { type: 'done'; index: number; total: number; complete: boolean };

export class SessionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const now = () => new Date().toISOString();
const aad = (id: string) => `interview_sessions:${id}`;

export function initialState(spec: AnySpec): AnyState {
  return {
    turns: [],
    draft: {},
    remaining: spec.fields.map((f) => f.key),
    questionIndex: 0,
    done: false,
    followedUp: [],
  };
}

const remainingFields = (spec: AnySpec, draft: Record<string, unknown>) =>
  spec.fields.filter((f) => !f.isComplete(draft)).map((f) => f.key);

export const lastQuestion = (state: AnyState): Turn | null =>
  [...state.turns].reverse().find((t) => t.role === 'assistant') ?? null;

/** The field the open question targets. */
export const currentField = (state: AnyState) => lastQuestion(state)?.field ?? null;

/**
 * Decide what to ask next. Pure.
 * - A vague answer gets one follow-up on the same field.
 * - A field that already had its follow-up is not asked again; the person can edit it later.
 */
export function planNext(
  spec: AnySpec,
  state: AnyState,
  answered: { field: string; vague: boolean } | null,
): { field: string; followUp: boolean } | null {
  if (state.questionIndex >= spec.maxQuestions) return null;
  const followed = state.followedUp ?? [];
  if (
    answered?.vague &&
    !followed.includes(answered.field) &&
    state.remaining.includes(answered.field)
  )
    return { field: answered.field, followUp: true };
  const field = state.remaining.find((k) => !followed.includes(k) && k !== answered?.field);
  return field ? { field, followUp: false } : null;
}

async function* askAndRecord(
  spec: AnySpec,
  state: AnyState,
  driver: Driver,
  target: { field: string; followUp: boolean },
): AsyncGenerator<SessionEvent> {
  let text = '';
  for await (const token of driver.ask(spec, state, target.field, target.followUp)) {
    text += token;
    yield { type: 'token', text: token };
  }
  text = text.trim();
  state.questionIndex += 1;
  state.turns.push({
    role: 'assistant',
    text,
    field: target.field,
    followUp: target.followUp,
    at: now(),
  });
  if (target.followUp) state.followedUp = [...(state.followedUp ?? []), target.field];
  yield {
    type: 'question',
    text,
    index: state.questionIndex,
    total: spec.maxQuestions,
    followUp: target.followUp,
  };
}

/** Ask the first question of a fresh state. Mutates `state`. */
export async function* openingTurn(
  spec: AnySpec,
  state: AnyState,
  driver: Driver,
): AsyncGenerator<SessionEvent> {
  const first = planNext(spec, state, null);
  if (!first) throw new Error('Interview spec has no fields');
  yield* askAndRecord(spec, state, driver, first);
}

/** Take one answer and stream the next question. Mutates `state`; the caller saves it after. */
export async function* answerTurn(
  spec: AnySpec,
  state: AnyState,
  answer: string,
  driver: Driver,
): AsyncGenerator<SessionEvent> {
  if (state.done) throw new SessionError('This session is already complete.', 409);
  const field = currentField(state);
  if (!field) throw new SessionError('There is no open question.', 409);
  state.turns.push({ role: 'user', text: answer, at: now() });
  yield { type: 'thinking' };

  const absorbed = await driver.absorb(spec, state, field, answer);
  // An extractor may only touch its own field's keys; the spec decides what those are.
  state.draft = { ...state.draft, ...absorbed.patch };
  state.remaining = remainingFields(spec, state.draft);

  const next = planNext(spec, state, { field, vague: absorbed.vague });
  if (!next) {
    state.done = true;
    yield {
      type: 'done',
      index: state.questionIndex,
      total: spec.maxQuestions,
      complete: state.remaining.length === 0,
    };
    return;
  }
  yield* askAndRecord(spec, state, driver, next);
}

/** Collect a generator's events (for non-streaming callers and tests). */
export async function drain(events: AsyncIterable<SessionEvent>): Promise<SessionEvent[]> {
  const out: SessionEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

/** Validate and shape the final output. */
export function finish<O>(
  spec: InterviewSpec<Record<string, unknown>, O>,
  state: AnyState,
): { ok: true; output: O; derived: string[] } | { ok: false; missing: string[] } {
  const parsed = spec.schema.safeParse(spec.finalize(state.draft));
  if (!parsed.success)
    return {
      ok: false,
      missing: [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'output')))],
    };
  return { ok: true, output: parsed.data, derived: spec.derivedFields?.(state.draft) ?? [] };
}

// ------------------------------------------------------------------ persistence (RLS via caller tx)

export interface SessionRecord {
  id: string;
  ref: string;
  kind: SessionKind;
  ownerId: string;
  companyId: string | null;
  status: 'active' | 'paused' | 'complete' | 'abandoned';
  mandateId: string | null;
  profileId: string | null;
  completedAt: Date | null;
  questionIndex: number;
  state: AnyState;
}

type Row = typeof interviewSessions.$inferSelect;

function toRecord(row: Row, state: AnyState): SessionRecord {
  return {
    id: row.id,
    ref: row.publicRef,
    kind: row.kind,
    ownerId: row.ownerId,
    companyId: row.companyId,
    status: row.status,
    mandateId: row.mandateId,
    profileId: row.profileId,
    completedAt: row.completedAt,
    questionIndex: row.questionIndex,
    state,
  };
}

/** Insert the session row and its initial (encrypted) state. */
export async function createSession(
  tx: Tx,
  spec: AnySpec,
  input: { ownerId: string; companyId?: string | null; state: AnyState },
): Promise<SessionRecord> {
  const [row] = await tx
    .insert(interviewSessions)
    .values({
      ownerId: input.ownerId,
      kind: spec.kind,
      companyId: input.companyId ?? null,
      maxQuestions: spec.maxQuestions,
      status: 'active',
    })
    .returning();
  await saveSession(tx, spec, row!.id, input.state, 0);
  return toRecord({ ...row!, questionIndex: input.state.questionIndex }, input.state);
}

export async function loadSession(tx: Tx, id: string): Promise<SessionRecord | null> {
  const [row] = await tx
    .select()
    .from(interviewSessions)
    .where(eq(interviewSessions.id, id))
    .limit(1);
  if (!row) return null;
  const state = row.transcript
    ? await decryptJson<AnyState>(row.transcript, { aad: aad(row.id) })
    : { turns: [], draft: {}, remaining: [], questionIndex: 0, done: false };
  return toRecord(row, state);
}

/**
 * Save state. `expectedIndex` is the question index the caller loaded; if another request moved the
 * session on in the meantime, nothing is written and this returns false.
 */
export async function saveSession(
  tx: Tx,
  spec: AnySpec,
  id: string,
  state: AnyState,
  expectedIndex: number,
): Promise<boolean> {
  const transcript = await encryptJson(state, { aad: aad(id) });
  const rows = await tx
    .update(interviewSessions)
    .set({
      transcript,
      questionIndex: state.questionIndex,
      // Mandate drafts hold no personal data and are mirrored for staff tooling. Profile drafts never are.
      draftOutput: spec.kind === 'mandate' ? state.draft : null,
      updatedAt: new Date(),
    })
    .where(and(eq(interviewSessions.id, id), eq(interviewSessions.questionIndex, expectedIndex)))
    .returning({ id: interviewSessions.id });
  return rows.length === 1;
}
