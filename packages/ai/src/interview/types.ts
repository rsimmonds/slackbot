import type { ZodType } from 'zod';
import type { AgentStep } from '../models';

/**
 * CONTRACT for adaptive interviews (spec 7.1.3). The engine (interview/engine.ts) runs any spec:
 * one question at a time, follow-ups on vague answers, stop at maxQuestions or when the
 * schema is complete, save and resume.
 */
export type SessionKind = 'mandate' | 'profile';

export interface Turn {
  role: 'assistant' | 'user';
  text: string;
  /** Which field the question targeted (assistant turns). */
  field?: string;
  /** True when this question was a follow-up on a vague answer. */
  followUp?: boolean;
  at: string;
}

export interface SessionState<Draft> {
  turns: Turn[];
  draft: Partial<Draft>;
  /** Fields still missing, in asking order. */
  remaining: string[];
  questionIndex: number;
  done: boolean;
}

/** One thing the interview needs to learn. */
export interface FieldSpec<Draft> {
  key: string;
  /** The default question (offline mode and as guidance for the model). */
  question: string;
  /** Asked when the answer is vague (offline mode). */
  followUp: string;
  /** Offline extraction: turn an answer into a draft patch, or null if too vague. */
  extract: (answer: string, draft: Partial<Draft>) => Partial<Draft> | null;
  /** True when the draft already covers this field. */
  isComplete: (draft: Partial<Draft>) => boolean;
}

export interface InterviewSpec<Draft, Output = Draft> {
  kind: SessionKind;
  agent: Extract<AgentStep, 'mandate-builder' | 'profile-interviewer'>;
  /** Display prefix for session refs, e.g. "MB" → "MB-7Q2K". */
  refPrefix: string;
  maxQuestions: number;
  fields: FieldSpec<Draft>[];
  /** Validates the final output. */
  schema: ZodType<Output>;
  /** Builds the final output from the draft (fills defaults, normalises). */
  finalize: (draft: Partial<Draft>) => Output;
  /** Opening line shown above the first question, e.g. "Reading your mandate." */
  intro: string;
}
