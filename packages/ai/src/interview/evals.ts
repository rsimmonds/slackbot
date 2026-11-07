import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { agentsDir } from '../prompt-source';
import { initialState, type AnySpec } from './engine';
import { extractOffline } from './offline';
import { mandateSpec } from './specs/mandate';

/**
 * Interview evals (spec 7.1.9). Each case feeds answers to named fields through the offline
 * extractors, then finalizes, and checks the document. Live scoring of the model path is added
 * when a key is available (recorded outputs will sit beside each case, as for other agents).
 */
const Case = z.object({
  id: z.string(),
  answers: z.array(z.tuple([z.string(), z.string()])),
  expect: z.record(z.string(), z.unknown()).optional(),
  vague: z.array(z.string()).optional(),
  absent: z.array(z.string()).optional(),
  derived: z.array(z.string()).optional(),
});
const SuiteFile = z.object({
  agent: z.string(),
  thresholds: z.object({ model: z.number(), fallback: z.number() }),
  notes: z.string().optional(),
  cases: z.array(Case),
});
export type InterviewEvalCase = z.infer<typeof Case>;

export const interviewSuites: { file: string; spec: AnySpec }[] = [
  { file: 'mandate-builder/evals/cases.json', spec: mandateSpec },
];

/** Read a dot path such as "scorecard.0.byDay" or "priorities.length". */
function at(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => {
    if (o == null) return undefined;
    if (k === 'length' && Array.isArray(o)) return o.length;
    return (o as Record<string, unknown>)[k];
  }, obj);
}

const same = (a: unknown, b: unknown) =>
  typeof a === 'string' && typeof b === 'string'
    ? a.trim().toLowerCase() === b.trim().toLowerCase()
    : JSON.stringify(a) === JSON.stringify(b);

export function gradeInterviewCase(spec: AnySpec, c: InterviewEvalCase): string[] {
  const state = initialState(spec);
  const vague: string[] = [];
  for (const [field, text] of c.answers) {
    const r = extractOffline(spec, state, field, text);
    if (r.vague) vague.push(field);
    state.draft = { ...state.draft, ...r.patch };
  }
  const out = spec.finalize(state.draft) as Record<string, unknown>;
  const derived: string[] = spec.derivedFields?.(state.draft) ?? [];
  const problems: string[] = [];
  for (const [path, want] of Object.entries(c.expect ?? {})) {
    const got = at(out, path);
    if (!same(got, want))
      problems.push(`${path}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
  for (const f of c.vague ?? [])
    if (!vague.includes(f)) problems.push(`${f} should be judged vague`);
  for (const f of c.answers.map(([f]) => f))
    if (vague.includes(f) && !(c.vague ?? []).includes(f))
      problems.push(`${f} judged vague unexpectedly`);
  for (const key of c.absent ?? []) {
    const v = out[key];
    if (!(v === null || v === undefined || (Array.isArray(v) && v.length === 0)))
      problems.push(`${key} should be empty, got ${JSON.stringify(v)}`);
  }
  for (const f of c.derived ?? [])
    if (!derived.includes(f)) problems.push(`${f} should be marked derived`);
  return problems;
}

export function runInterviewSuite(def: { file: string; spec: AnySpec }) {
  const suite = SuiteFile.parse(JSON.parse(readFileSync(join(agentsDir, def.file), 'utf8')));
  const failures = suite.cases
    .map((c) => ({ id: c.id, problems: gradeInterviewCase(def.spec, c) }))
    .filter((f) => f.problems.length);
  const passed = suite.cases.length - failures.length;
  const rate = passed / suite.cases.length;
  return {
    suite: suite.agent,
    total: suite.cases.length,
    passed,
    rate,
    threshold: suite.thresholds.fallback,
    ok: rate >= suite.thresholds.fallback,
    failures,
  };
}
