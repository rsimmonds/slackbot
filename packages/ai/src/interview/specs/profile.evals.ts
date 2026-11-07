import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { agentsDir } from '../../prompt-source';
import { finalizeProfile, profileFields, type ProfileDraft } from './profile';

/**
 * Profile Interviewer eval suite, offline mode: scores the deterministic extractors and the final
 * portfolio against agents/profile-interviewer/evals/cases.json. The live model column is added
 * when the interview engine records model turns (needs ANTHROPIC_API_KEY).
 */

const FieldCase = z.object({
  id: z.string(),
  field: z.string(),
  answer: z.string(),
  draft: z.record(z.string(), z.unknown()).optional(),
  expect: z.record(z.string(), z.unknown()),
  note: z.string().optional(),
});
const InterviewCase = z.object({
  id: z.string(),
  answers: z.record(z.string(), z.string()),
  expect: z.record(z.string(), z.unknown()),
  note: z.string().optional(),
});
const Suite = z.object({
  agent: z.literal('profile-interviewer'),
  thresholds: z.object({ model: z.number(), fallback: z.number() }),
  notes: z.string().optional(),
  cases: z.array(z.union([FieldCase, InterviewCase])),
});
export type ProfileSuite = z.infer<typeof Suite>;

export function loadProfileSuite(): ProfileSuite {
  return Suite.parse(
    JSON.parse(readFileSync(join(agentsDir, 'profile-interviewer/evals/cases.json'), 'utf8')),
  );
}

const lower = (v: unknown) => JSON.stringify(v ?? null).toLowerCase();

function checkNotContain(kept: unknown, banned: unknown, problems: string[]) {
  for (const w of (banned as string[]) ?? [])
    if (lower(kept).includes(w.toLowerCase())) problems.push(`kept "${w}"`);
}

function gradeField(c: z.infer<typeof FieldCase>): string[] {
  const spec = profileFields.find((f) => f.key === c.field);
  if (!spec) return [`unknown field ${c.field}`];
  const patch = spec.extract(c.answer, (c.draft ?? {}) as Partial<ProfileDraft>);
  const problems: string[] = [];
  const e = c.expect;
  if (e.vague === true) {
    if (patch !== null) problems.push(`expected a follow-up, got ${JSON.stringify(patch)}`);
    return problems;
  }
  if (!patch) return ['extractor returned nothing (treated as vague)'];
  const keptWithoutScrubNames = { ...patch, scrubbed: undefined };
  checkNotContain(keptWithoutScrubNames, e.notContain, problems);
  for (const [key, want] of Object.entries(e)) {
    switch (key) {
      case 'notContain':
        break;
      case 'level':
      case 'yearsExperience':
        if ((patch as Record<string, unknown>)[key] !== want)
          problems.push(`${key} ${JSON.stringify((patch as Record<string, unknown>)[key])} (want ${JSON.stringify(want)})`);
        break;
      case 'outcome': {
        const o = patch.outcomesByField?.[c.field];
        if (!o) {
          problems.push('no outcome');
          break;
        }
        for (const [k, v] of Object.entries(want as Record<string, string>))
          if ((o as Record<string, unknown>)[k] !== v) problems.push(`outcome.${k} "${(o as Record<string, unknown>)[k]}" (want "${v}")`);
        break;
      }
      case 'scrubbed':
        for (const a of want as string[])
          if (!patch.scrubbed?.includes(a)) problems.push(`did not record removal of ${a}`);
        break;
      case 'headlineNotMatch':
        for (const w of want as string[])
          if ((patch.headline ?? '').toLowerCase().includes(w.toLowerCase()))
            problems.push(`headline contains "${w}": ${patch.headline}`);
        if (!patch.headline) problems.push('no headline');
        break;
      case 'teamBuildsMin':
        if ((patch.teamBuilds?.length ?? 0) < Number(want)) problems.push(`teamBuilds ${patch.teamBuilds?.length ?? 0}`);
        break;
      case 'dealBreakersMin':
        if ((patch.ideal?.dealBreakers?.length ?? 0) < Number(want))
          problems.push(`dealBreakers ${JSON.stringify(patch.ideal?.dealBreakers)}`);
        break;
      case 'ideal':
        for (const [k, v] of Object.entries(want as Record<string, unknown>))
          if (JSON.stringify((patch.ideal as Record<string, unknown> | undefined)?.[k] ?? null) !== JSON.stringify(v))
            problems.push(`ideal.${k} ${JSON.stringify((patch.ideal as Record<string, unknown> | undefined)?.[k])} (want ${JSON.stringify(v)})`);
        break;
      default:
        problems.push(`unknown expectation ${key}`);
    }
  }
  return problems;
}

/** Run a whole interview through the extractors in field order. */
export function runOfflineInterview(answers: Record<string, string>): Partial<ProfileDraft> {
  let draft: Partial<ProfileDraft> = {};
  for (const field of profileFields) {
    const answer = answers[field.key];
    if (answer === undefined) continue;
    const patch = field.extract(answer, draft);
    if (patch) draft = { ...draft, ...patch };
  }
  return draft;
}

function gradeInterview(c: z.infer<typeof InterviewCase>): string[] {
  const draft = runOfflineInterview(c.answers);
  const problems: string[] = [];
  let portfolio;
  try {
    portfolio = finalizeProfile(draft);
  } catch (e) {
    return [`invalid portfolio: ${(e as Error).message.slice(0, 200)}`];
  }
  if (c.expect.outcomesMin && portfolio.outcomes.length < Number(c.expect.outcomesMin))
    problems.push(`outcomes ${portfolio.outcomes.length} < ${c.expect.outcomesMin}`);
  checkNotContain(portfolio, c.expect.notContain, problems);
  return problems;
}

export interface ProfileEvalResult {
  total: number;
  passed: number;
  rate: number;
  threshold: number;
  failures: { id: string; problems: string[] }[];
}

export function runProfileEvals(suite = loadProfileSuite()): ProfileEvalResult {
  const failures: ProfileEvalResult['failures'] = [];
  for (const c of suite.cases) {
    const problems = 'field' in c ? gradeField(c) : gradeInterview(c);
    if (problems.length) failures.push({ id: c.id, problems });
  }
  const total = suite.cases.length;
  const passed = total - failures.length;
  return { total, passed, rate: passed / total, threshold: suite.thresholds.fallback, failures };
}
