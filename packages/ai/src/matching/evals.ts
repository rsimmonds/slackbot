import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { agentModels, type ModelId } from '../models';
import { agentsDir } from '../prompt-source';
import { systemPrompt } from '../prompts';
import type { LlmProvider } from '../provider';
import { MatchRankingSchema, type BlindMandate, type MatchRanking } from '../schemas/match';
import { buildBlindProfile, type RawProfileForBlind } from './blind';
import type { Matcher } from './fairness';
import { hardFilter, type CandidateFacts, type MandateFacts } from './filters';
import { matcherUserMessage, rankOffline, sanitizeRanking } from './rank';

/**
 * Matcher evals (spec 7.1.9). Four kinds of case:
 *   filter   — stage-one hard constraints admit or exclude a candidate
 *   blind    — the blind builder removes identity and protected attributes
 *   rank     — ordering, ranges and reasons for and against
 *   sanitize — invented or duplicate refs are dropped
 * Offline (CI): the deterministic matcher. Live (EVALS_LIVE=1 + key): rank cases call Claude.
 */
const Case = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('filter'),
    id: z.string(),
    note: z.string().optional(),
    input: z.object({ mandate: z.custom<MandateFacts>(), candidate: z.custom<CandidateFacts>() }),
    expect: z.object({ pass: z.boolean(), reason: z.string().optional() }),
  }),
  z.object({
    kind: z.literal('blind'),
    id: z.string(),
    note: z.string().optional(),
    input: z.object({
      profile: z.custom<RawProfileForBlind>(),
      twin: z.custom<RawProfileForBlind>().optional(),
    }),
    expect: z.object({
      absent: z.array(z.string()).default([]),
      present: z.array(z.string()).default([]),
      identicalToTwin: z.boolean().optional(),
    }),
  }),
  z.object({
    kind: z.literal('rank'),
    id: z.string(),
    note: z.string().optional(),
    input: z.object({
      mandate: z.custom<BlindMandate>(),
      candidates: z.array(
        z.object({
          label: z.string().regex(/^[A-Z0-9]{1,6}$/),
          profile: z.custom<RawProfileForBlind>(),
        }),
      ),
    }),
    expect: z.object({
      top: z.string().optional(),
      before: z.array(z.tuple([z.string(), z.string()])).default([]),
      sameScore: z.array(z.tuple([z.string(), z.string()])).default([]),
      reasonsBothWays: z.boolean().default(true),
      maxWidth: z.number().optional(),
    }),
  }),
  z.object({
    kind: z.literal('sanitize'),
    id: z.string(),
    note: z.string().optional(),
    input: z.object({ refs: z.array(z.string()), output: z.custom<MatchRanking>() }),
    expect: z.object({ refs: z.array(z.string()) }),
  }),
]);
export type MatcherCase = z.infer<typeof Case>;

const SuiteFile = z.object({
  agent: z.literal('matcher'),
  thresholds: z.object({ offline: z.number(), model: z.number() }),
  notes: z.string().optional(),
  cases: z.array(Case),
});

export const matcherSuiteFile = 'matcher/evals/cases.json';

export function loadMatcherSuite() {
  return SuiteFile.parse(JSON.parse(readFileSync(join(agentsDir, matcherSuiteFile), 'utf8')));
}

const refFor = (label: string) => `P${label.padEnd(6, '0')}`;

/** A live Matcher over a provider (no database): used by EVALS_LIVE and an optional fairness run. */
export function providerMatcher(provider: LlmProvider): Matcher {
  return async (mandate, candidates) => {
    const res = await provider.complete({
      step: 'matcher',
      model: agentModels.matcher as ModelId,
      system: systemPrompt('matcher').text,
      user: matcherUserMessage(mandate, candidates),
      schema: MatchRankingSchema,
      effort: 'medium',
      maxTokens: 16000,
    });
    const parsed = MatchRankingSchema.safeParse(res.output);
    if (!parsed.success) return { matches: [] };
    return sanitizeRanking(parsed.data, new Set(candidates.map((c) => c.ref)));
  };
}

async function grade(c: MatcherCase, matcher: Matcher): Promise<string[]> {
  const problems: string[] = [];
  switch (c.kind) {
    case 'filter': {
      const r = hardFilter(c.input.mandate, c.input.candidate);
      if (r.pass !== c.expect.pass) problems.push(`pass ${r.pass} (want ${c.expect.pass})`);
      if (!r.pass && c.expect.reason && r.reason !== c.expect.reason)
        problems.push(`reason ${r.reason} (want ${c.expect.reason})`);
      break;
    }
    case 'blind': {
      const out = JSON.stringify(buildBlindProfile(c.input.profile, 'P000000'));
      for (const s of c.expect.absent)
        if (out.toLowerCase().includes(s.toLowerCase())) problems.push(`still contains "${s}"`);
      for (const s of c.expect.present)
        if (!out.toLowerCase().includes(s.toLowerCase())) problems.push(`lost "${s}"`);
      if (out.includes('yearsExperience')) problems.push('carries years of experience');
      if (c.expect.identicalToTwin && c.input.twin) {
        const twin = JSON.stringify(buildBlindProfile(c.input.twin, 'P000000'));
        if (twin !== out) problems.push('differs from its twin');
      }
      break;
    }
    case 'rank': {
      const profiles = c.input.candidates.map((x) => buildBlindProfile(x.profile, refFor(x.label)));
      const ranking = sanitizeRanking(
        await matcher(c.input.mandate, profiles),
        new Set(profiles.map((p) => p.ref)),
      );
      const byLabel = new Map(
        c.input.candidates.map((x) => [
          x.label,
          ranking.matches.find((m) => m.ref === refFor(x.label)),
        ]),
      );
      const mid = (l: string) => {
        const m = byLabel.get(l);
        return m ? (m.scoreLow + m.scoreHigh) / 2 : -1;
      };
      if (c.expect.top && ranking.matches[0]?.ref !== refFor(c.expect.top))
        problems.push(`top is ${ranking.matches[0]?.ref ?? 'none'} (want ${refFor(c.expect.top)})`);
      for (const [a, b] of c.expect.before)
        if (!(mid(a) > mid(b))) problems.push(`${a} (${mid(a)}) not above ${b} (${mid(b)})`);
      for (const [a, b] of c.expect.sameScore)
        if (mid(a) !== mid(b)) problems.push(`${a} (${mid(a)}) and ${b} (${mid(b)}) differ`);
      for (const m of ranking.matches) {
        if (m.scoreLow > m.scoreHigh) problems.push(`${m.ref} range inverted`);
        if (c.expect.maxWidth !== undefined && m.scoreHigh - m.scoreLow > c.expect.maxWidth)
          problems.push(`${m.ref} range wider than ${c.expect.maxWidth}`);
        if (c.expect.reasonsBothWays) {
          const dirs = new Set(m.reasons.map((r) => r.direction));
          if (!dirs.has('for') || !dirs.has('against'))
            problems.push(`${m.ref} lacks reasons both for and against`);
        }
      }
      break;
    }
    case 'sanitize': {
      const out = sanitizeRanking(MatchRankingSchema.parse(c.input.output), new Set(c.input.refs));
      const got = out.matches.map((m) => m.ref);
      if (JSON.stringify(got) !== JSON.stringify(c.expect.refs))
        problems.push(`refs ${JSON.stringify(got)} (want ${JSON.stringify(c.expect.refs)})`);
      break;
    }
  }
  return problems;
}

export interface MatcherSuiteResult {
  total: number;
  passed: number;
  rate: number;
  threshold: number;
  ok: boolean;
  failures: { id: string; problems: string[] }[];
}

export async function runMatcherSuite(
  opts: { matcher?: Matcher; live?: boolean } = {},
): Promise<MatcherSuiteResult> {
  const suite = loadMatcherSuite();
  const matcher = opts.matcher ?? rankOffline;
  const failures: MatcherSuiteResult['failures'] = [];
  let passed = 0;
  for (const c of suite.cases) {
    const problems = await grade(c, matcher);
    if (problems.length) failures.push({ id: c.id, problems });
    else passed++;
  }
  const threshold = opts.live ? suite.thresholds.model : suite.thresholds.offline;
  const rate = passed / suite.cases.length;
  return { total: suite.cases.length, passed, rate, threshold, ok: rate >= threshold, failures };
}
