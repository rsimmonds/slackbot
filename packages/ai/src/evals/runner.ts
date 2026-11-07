import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { enforceListingRules, listingUserMessage } from '../agents/listing-parser';
import { SourceItemPayload, sourceItemMessage } from '../format';
import { agentModels, costMicros, type AgentStep, type ModelId } from '../models';
import { agentsDir } from '../prompt-source';
import { systemPrompt } from '../prompts';
import { FakeProvider, requestKey, type LlmProvider } from '../provider';
import { offlineFallbacks } from '../providers';
import { ParsedListingSchema } from '../schemas/listing';
import { MoveClassificationSchema, MoveDraftSchema } from '../schemas/move';

/**
 * Eval suites (spec 7.1.9). Offline (CI, no key): scores the deterministic fallback on every case
 * not marked `fallback: false`, and replays the last recorded model output where one exists.
 * Live (EVALS_LIVE=1 + ANTHROPIC_API_KEY): calls Claude, scores it, and records the outputs.
 */

export const suites = [
  { file: 'listing-parser/evals/cases.json', step: 'listing-parser' },
  { file: 'moves-tracker/evals/classify.json', step: 'moves-tracker.classify' },
  { file: 'moves-tracker/evals/draft.json', step: 'moves-tracker.draft' },
] as const satisfies readonly { file: string; step: AgentStep }[];

const Case = z.object({
  id: z.string(),
  input: z.unknown(),
  expect: z.record(z.string(), z.unknown()),
  fallback: z.boolean().optional(),
  note: z.string().optional(),
  recorded: z.unknown().optional(),
  recordedModel: z.string().optional(),
  recordedAt: z.string().optional(),
});
const SuiteFile = z.object({
  agent: z.string(),
  thresholds: z.object({ model: z.number(), fallback: z.number() }),
  notes: z.string().optional(),
  cases: z.array(Case),
});
export type EvalCase = z.infer<typeof Case>;
export type SuiteFile = z.infer<typeof SuiteFile>;

export function loadSuite(file: string): SuiteFile {
  return SuiteFile.parse(JSON.parse(readFileSync(join(agentsDir, file), 'utf8')));
}

const schemaFor = {
  'listing-parser': ParsedListingSchema,
  'moves-tracker.classify': MoveClassificationSchema,
  'moves-tracker.draft': MoveDraftSchema,
} as const;
type SuiteStep = keyof typeof schemaFor;

export function userMessage(step: SuiteStep, input: unknown): string {
  if (step === 'listing-parser') return listingUserMessage(String(input));
  return sourceItemMessage(SourceItemPayload.parse(input));
}

const sameText = (a: unknown, b: unknown) =>
  String(a ?? '')
    .trim()
    .toLowerCase() ===
  String(b ?? '')
    .trim()
    .toLowerCase();
const contains = (a: unknown, b: unknown) =>
  String(a ?? '')
    .toLowerCase()
    .includes(String(b ?? '').toLowerCase());

/** Returns the list of failed expectations (empty = pass). */
export function grade(step: SuiteStep, c: EvalCase, raw: unknown): string[] {
  const parsed = schemaFor[step].safeParse(raw);
  if (!parsed.success) return [`invalid output: ${parsed.error.issues[0]?.message}`];
  let out = parsed.data as Record<string, unknown>;
  const problems: string[] = [];
  if (step === 'listing-parser')
    out = enforceListingRules(parsed.data as z.infer<typeof ParsedListingSchema>);
  if (step === 'moves-tracker.draft') {
    const input = SourceItemPayload.parse(c.input);
    const urls = (out.sources as { url: string }[]).map((s) => s.url);
    if (urls.some((u) => u !== input.url))
      problems.push(`cites a URL not in the input: ${urls.join(', ')}`);
  }
  const json = JSON.stringify(out);
  for (const [key, want] of Object.entries(c.expect)) {
    const got = out[key];
    switch (key) {
      case 'prioritiesMin':
        if ((out.priorities as string[]).length < Number(want))
          problems.push(`priorities ${(out.priorities as string[]).length} < ${want}`);
        break;
      case 'gapsMatch':
        for (const re of want as string[])
          if (!(out.gaps as string[]).some((g) => new RegExp(re).test(g)))
            problems.push(`no gap matching /${re}/`);
        break;
      case 'gapsNotMatch':
        for (const re of want as string[])
          if ((out.gaps as string[]).some((g) => new RegExp(re, 'i').test(g)))
            problems.push(`unexpected gap /${re}/`);
        break;
      case 'outputNotMatch':
        for (const re of want as string[])
          if (new RegExp(re).test(json)) problems.push(`output matches /${re}/`);
        break;
      case 'summaryNotMatch':
        for (const w of want as string[])
          if (contains(out.summary, w)) problems.push(`summary uses "${w}"`);
        break;
      case 'titleMatch':
        if (!new RegExp(String(want)).test(String(out.title)))
          problems.push(`title "${out.title}" !~ /${want}/`);
        break;
      case 'previousRoleMatch':
        if (!contains(out.previousRole, want)) problems.push(`previousRole "${out.previousRole}"`);
        break;
      case 'confidenceMax':
        if (Number(out.confidence) > Number(want))
          problems.push(`confidence ${out.confidence} > ${want}`);
        break;
      case 'reportingLine':
      case 'companyName':
        if (want === null ? got !== null : !contains(got, want))
          problems.push(`${key} "${got}" (want ${JSON.stringify(want)})`);
        break;
      case 'personName':
      case 'title':
        if (!sameText(got, want)) problems.push(`${key} "${got}" (want "${want}")`);
        break;
      default:
        if (JSON.stringify(got ?? null) !== JSON.stringify(want))
          problems.push(`${key} ${JSON.stringify(got)} (want ${JSON.stringify(want)})`);
    }
  }
  return problems;
}

export interface ModeResult {
  scored: number;
  passed: number;
  rate: number | null;
  threshold: number;
  ok: boolean;
}

export interface SuiteResult {
  suite: string;
  step: SuiteStep;
  total: number;
  model: ModeResult & { source: 'recorded' | 'live' };
  fallback: ModeResult;
  failures: { id: string; mode: 'model' | 'fallback'; problems: string[] }[];
  costMicros: number;
}

const mode = (scored: number, passed: number, threshold: number): ModeResult => {
  const rate = scored ? passed / scored : null;
  return { scored, passed, rate, threshold, ok: rate === null || rate >= threshold };
};

export async function runSuite(
  def: (typeof suites)[number],
  opts: { live?: LlmProvider; record?: boolean } = {},
): Promise<SuiteResult> {
  const suite = loadSuite(def.file);
  const step = def.step;
  const system = systemPrompt(step).text;
  const fallbackProvider = new FakeProvider(new Map(), offlineFallbacks);
  const failures: SuiteResult['failures'] = [];
  let fbScored = 0;
  let fbPassed = 0;
  let mScored = 0;
  let mPassed = 0;
  let cost = 0;

  for (const c of suite.cases) {
    const user = userMessage(step, c.input);
    const req = {
      step,
      model: agentModels[step],
      system,
      user,
      schema: schemaFor[step],
      effort: 'low' as const,
      maxTokens: 4000,
    };

    if (c.fallback !== false) {
      fbScored++;
      const problems = grade(step, c, (await fallbackProvider.complete(req)).output);
      if (problems.length) failures.push({ id: c.id, mode: 'fallback', problems });
      else fbPassed++;
    }

    let modelOutput: unknown;
    if (opts.live) {
      const res = await opts.live.complete({
        ...req,
        effort: agentModels[step] === 'claude-haiku-5-5' ? 'low' : 'medium',
      });
      if (
        res.servedModel in { 'claude-haiku-5-5': 1, 'claude-sonnet-5-5': 1, 'claude-opus-5-5': 1 }
      ) {
        cost += costMicros(res.servedModel as ModelId, {
          input: res.usage.input + res.usage.cacheWrite * 1.25,
          output: res.usage.output,
          cacheRead: res.usage.cacheRead,
        });
      }
      modelOutput = res.invalidReason ? { invalid: res.invalidReason } : res.output;
      if (opts.record)
        Object.assign(c, {
          recorded: modelOutput,
          recordedModel: res.servedModel,
          recordedAt: new Date().toISOString(),
        });
    } else if (c.recorded !== undefined) {
      modelOutput = (
        await new FakeProvider(new Map([[requestKey(step, user), c.recorded]])).complete(req)
      ).output;
    }
    if (modelOutput !== undefined) {
      mScored++;
      const problems = grade(step, c, modelOutput);
      if (problems.length) failures.push({ id: c.id, mode: 'model', problems });
      else mPassed++;
    }
  }

  if (opts.live && opts.record)
    writeFileSync(join(agentsDir, def.file), `${JSON.stringify(suite, null, 2)}\n`);
  return {
    suite: suite.agent,
    step,
    total: suite.cases.length,
    model: {
      ...mode(mScored, mPassed, suite.thresholds.model),
      source: opts.live ? 'live' : 'recorded',
    },
    fallback: mode(fbScored, fbPassed, suite.thresholds.fallback),
    failures,
    costMicros: cost,
  };
}
