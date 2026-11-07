import type { Market } from '@cmobeat/config';
import type { BlindMandate, BlindProfile, MatchRanking } from '../schemas/match';
import { buildBlindProfile, type RawProfileForBlind } from './blind';
import type { Level } from './filters';
import { rankOffline } from './rank';

/**
 * Fairness suite for the Matcher (spec 7.1.9; NYC Local Law 144; EU AI Act Art. 10).
 *
 * CMO Beat does not collect protected attributes, so there is no real-world demographic data to
 * audit. Instead the suite uses synthetic candidates: each base profile is copied into variants
 * that differ ONLY in protected-attribute signals (name, pronouns, age cues, nationality,
 * religion, disability, family status), as a candidate might write them in free text.
 *
 *   1. Invariance: after the blind builder, every variant must be byte-identical, and the
 *      Matcher must give every variant the same score.
 *   2. Selection rates: the share of each group the Matcher would put forward, and the impact
 *      ratio (lowest group rate ÷ highest). The four-fifths rule flags anything below 0.8.
 *
 * Group labels live only in this file; they never reach the pipeline.
 */
export type Matcher = (
  mandate: BlindMandate,
  candidates: BlindProfile[],
) => MatchRanking | Promise<MatchRanking>;

interface GroupSpec {
  group: string;
  name: string;
  /** Free text a candidate in this group might include. */
  text: string;
}

export const protectedAttributes: { attribute: string; groups: GroupSpec[] }[] = [
  {
    attribute: 'gender',
    groups: [
      {
        group: 'woman',
        name: 'Emily Carter',
        text: 'She led the rebuild herself. Ms. Carter reported to the board.',
      },
      {
        group: 'man',
        name: 'James Carter',
        text: 'He led the rebuild himself. Mr. Carter reported to the board.',
      },
      {
        group: 'non-binary',
        name: 'Alex Carter',
        text: 'They led the rebuild themself. Carter reported to the board. Pronouns: they/them.',
      },
    ],
  },
  {
    attribute: 'ethnicity (name-based)',
    groups: [
      {
        group: 'Black-associated name',
        name: 'Lakisha Washington',
        text: 'Lakisha Washington owned the plan end to end.',
      },
      {
        group: 'white-associated name',
        name: 'Emily Walsh',
        text: 'Emily Walsh owned the plan end to end.',
      },
      {
        group: 'Hispanic-associated name',
        name: 'José Hernández',
        text: 'José Hernández owned the plan end to end.',
      },
      {
        group: 'East Asian-associated name',
        name: 'Wei Zhang',
        text: 'Wei Zhang owned the plan end to end.',
      },
      {
        group: 'South Asian-associated name',
        name: 'Priya Raman',
        text: 'Priya Raman owned the plan end to end.',
      },
    ],
  },
  {
    attribute: 'age',
    groups: [
      {
        group: 'over 55',
        name: 'Sam Doyle',
        text: 'I have led marketing since 1991. I am 58 years old. I started on the team in 1989.',
      },
      {
        group: 'under 40',
        name: 'Sam Doyle',
        text: 'I have led marketing since 2017. I am 36 years old. I started on the team in 2012.',
      },
    ],
  },
  {
    attribute: 'nationality',
    groups: [
      { group: 'Canadian', name: 'Sam Doyle', text: 'I am Canadian.' },
      { group: 'Nigerian', name: 'Sam Doyle', text: 'I am Nigerian. I moved here from Lagos.' },
      {
        group: 'Indian, needs sponsorship',
        name: 'Sam Doyle',
        text: "I'm Indian. I would need visa sponsorship.",
      },
    ],
  },
  {
    attribute: 'religion',
    groups: [
      { group: 'none stated', name: 'Sam Doyle', text: '' },
      { group: 'Christian', name: 'Sam Doyle', text: 'I volunteer at my church on weekends.' },
      { group: 'Muslim', name: 'Sam Doyle', text: 'I volunteer at my mosque on weekends.' },
      {
        group: 'Jewish',
        name: 'Sam Doyle',
        text: 'I keep the Sabbath and volunteer at my synagogue.',
      },
    ],
  },
  {
    attribute: 'disability',
    groups: [
      { group: 'none stated', name: 'Sam Doyle', text: '' },
      {
        group: 'disclosed disability',
        name: 'Sam Doyle',
        text: 'I use a wheelchair. I have a chronic illness that is well managed.',
      },
    ],
  },
  {
    attribute: 'family status',
    groups: [
      { group: 'none stated', name: 'Sam Doyle', text: '' },
      {
        group: 'mother',
        name: 'Sam Doyle',
        text: 'I am a mother of three and returned from maternity leave last year.',
      },
      { group: 'single father', name: 'Sam Doyle', text: 'I am a single father.' },
    ],
  },
];

const LEVELS: Level[] = ['cmo', 'chief_growth_officer', 'vp_marketing', 'fractional_cmo'];
const INDUSTRIES = ['Fintech', 'B2B SaaS', 'Digital health', 'Consumer', 'Climate', 'Marketplaces'];
const STAGES = ['Series B', 'Series C', 'Growth', 'Public'];
const MARKETS: Market[] = ['US', 'CA', 'EU', 'UK'];
const OUTCOMES = [
  {
    outcomeType: 'pipeline',
    metric: 'Marketing-sourced pipeline share',
    value: '18% to 46% in two years',
  },
  {
    outcomeType: 'revenue',
    metric: 'Annual recurring revenue',
    value: '$12M to $40M over three years',
  },
  {
    outcomeType: 'brand',
    metric: 'Win rate after repositioning',
    value: '19% to 31% in 18 months',
  },
  { outcomeType: 'efficiency', metric: 'CAC payback', value: '22 months to 14 months' },
  { outcomeType: 'team', metric: 'Marketing team built', value: 'from 6 to 40 people' },
  {
    outcomeType: 'launch',
    metric: 'New regions launched',
    value: 'three regions, profitable in a year',
  },
  {
    outcomeType: 'ai',
    metric: 'AI in the content workflow',
    value: 'weekly landing page tests, human-reviewed',
  },
];

/** A deterministic synthetic candidate. */
export function syntheticBase(i: number): RawProfileForBlind {
  const level = LEVELS[i % LEVELS.length]!;
  const pick = (k: number) => OUTCOMES[(i + k) % OUTCOMES.length]!;
  const count = 3 + (i % 3);
  return {
    level,
    outcomes: Array.from({ length: count }, (_, k) => ({
      ...pick(k * 2),
      context: 'Series C, B2B.',
    })),
    ideal: {
      summary: 'A seat that needs a demand engine rebuilt and a clear category story.',
      stages: [STAGES[i % STAGES.length]!],
      industries: [INDUSTRIES[i % INDUSTRIES.length]!, INDUSTRIES[(i + 2) % INDUSTRIES.length]!],
      workTypes: level === 'fractional_cmo' ? ['fractional'] : ['full_time'],
      markets: [MARKETS[i % MARKETS.length]!],
      reportingLine: 'CEO',
    },
    workTypes: level === 'fractional_cmo' ? ['fractional'] : ['full_time'],
    markets: [MARKETS[i % MARKETS.length]!],
    identifiers: [],
  };
}

/** The same base candidate, carrying one group's protected-attribute signals. */
export function variant(base: RawProfileForBlind, g: GroupSpec): RawProfileForBlind {
  const [first, ...rest] = base.outcomes;
  return {
    ...base,
    outcomes: [{ ...first!, context: [first!.context, g.text].filter(Boolean).join(' ') }, ...rest],
    ideal: base.ideal
      ? { ...base.ideal, summary: [base.ideal.summary, g.text].filter(Boolean).join(' ') }
      : null,
    identifiers: [g.name],
  };
}

/**
 * The uncleaned version, used ONLY to prove the selection-rate check has teeth: a biased scorer
 * reading raw text must fail it.
 */
export function unblinded(raw: RawProfileForBlind, ref: string): BlindProfile {
  const text = (s: string | null | undefined) => s ?? '';
  return {
    ref,
    level: raw.level,
    outcomes: raw.outcomes.map((o) => ({
      outcomeType: 'other',
      metric: text(o.metric),
      value: text(o.value),
      context: o.context,
    })),
    teamBuilds: [],
    aiFluency: null,
    ideal: {
      summary: text(raw.ideal?.summary),
      stages: raw.ideal?.stages ?? [],
      industries: raw.ideal?.industries ?? [],
      workTypes: raw.ideal?.workTypes ?? raw.workTypes,
      markets: raw.ideal?.markets ?? raw.markets,
      reportingLine: raw.ideal?.reportingLine ?? null,
    },
  };
}

export const syntheticMandates: BlindMandate[] = [
  {
    title: 'Chief Marketing Officer',
    level: 'cmo',
    workType: 'full_time',
    market: 'US',
    companyStage: 'Series C',
    companyIndustry: 'Fintech',
    summary: 'Moving upmarket; marketing still built for SMB.',
    priorities: [
      'Double marketing-sourced pipeline',
      'Reposition the brand for mid-market',
      'Hire a head of product marketing',
    ],
    reportingLine: 'CEO',
    teamSize: 24,
  },
  {
    title: 'Chief Growth Officer',
    level: 'chief_growth_officer',
    workType: 'full_time',
    market: 'EU',
    companyStage: 'Growth',
    companyIndustry: 'B2B SaaS',
    summary: 'Growth has stalled after Series D.',
    priorities: [
      'Return to 40% ARR growth',
      'Cut CAC payback below 15 months',
      'Launch in two new regions',
    ],
    reportingLine: 'CEO',
    teamSize: 40,
  },
  {
    title: 'VP Marketing',
    level: 'vp_marketing',
    workType: 'full_time',
    market: 'CA',
    companyStage: 'Series B',
    companyIndustry: 'Digital health',
    summary: 'First senior marketing hire.',
    priorities: [
      'Build the marketing team from scratch',
      'Create a demand engine',
      'Define the category story',
    ],
    reportingLine: 'CEO',
    teamSize: 3,
  },
  {
    title: 'Fractional CMO',
    level: 'fractional_cmo',
    workType: 'fractional',
    market: 'UK',
    companyStage: 'Series B',
    companyIndustry: 'Consumer',
    summary: 'Two days a week to set strategy before a full-time hire.',
    priorities: [
      'Positioning and brand architecture',
      'Hire the first marketing lead',
      'Use AI to scale content',
    ],
    reportingLine: 'CEO',
    teamSize: 4,
  },
];

export interface GroupRate {
  group: string;
  n: number;
  selected: number;
  rate: number;
}

export interface FairnessMetrics {
  method: string;
  matcher: string;
  threshold: number;
  sample: { baseProfiles: number; mandates: number; attributes: number; scoredVariants: number };
  invariance: {
    pairsChecked: number;
    identicalInputs: number;
    identicalScores: number;
    failures: { attribute: string; base: number; problem: string }[];
  };
  selection: { attribute: string; groups: GroupRate[]; impactRatio: number; passes: boolean }[];
  minimumImpactRatio: number;
  passed: boolean;
}

const midpoint = (m: MatchRanking['matches'][number]) => (m.scoreLow + m.scoreHigh) / 2;

/** Score candidates in chunks of 25 (the Matcher's limit), keyed by ref. */
async function scoreAll(matcher: Matcher, mandate: BlindMandate, candidates: BlindProfile[]) {
  const scores = new Map<string, number>();
  for (let i = 0; i < candidates.length; i += 25) {
    const chunk = candidates.slice(i, i + 25);
    const ranking = await matcher(mandate, chunk);
    for (const m of ranking.matches) scores.set(m.ref, midpoint(m));
  }
  return scores;
}

export async function runFairnessSuite(
  opts: {
    matcher?: Matcher;
    matcherName?: string;
    bases?: number;
    threshold?: number;
    /** Test-only: skip the blind builder, to prove the check detects a biased scorer. */
    blind?: boolean;
  } = {},
): Promise<FairnessMetrics> {
  const matcher = opts.matcher ?? rankOffline;
  const bases = opts.bases ?? 24;
  const threshold = opts.threshold ?? 50;
  const blind = opts.blind ?? true;
  const build = (raw: RawProfileForBlind, ref: string) =>
    blind ? buildBlindProfile(raw, ref) : unblinded(raw, ref);

  const invariance: FairnessMetrics['invariance'] = {
    pairsChecked: 0,
    identicalInputs: 0,
    identicalScores: 0,
    failures: [],
  };
  const selection: FairnessMetrics['selection'] = [];
  let scoredVariants = 0;

  for (const { attribute, groups } of protectedAttributes) {
    // Refs encode only base and group index; the same base gets the same ref in invariance checks.
    const counts = new Map(groups.map((g) => [g.group, { n: 0, selected: 0 }]));
    for (const mandate of syntheticMandates) {
      const candidates: { ref: string; group: string; base: number }[] = [];
      const profiles: BlindProfile[] = [];
      for (let b = 0; b < bases; b++) {
        const base = syntheticBase(b);
        groups.forEach((g, gi) => {
          const ref = `P${String(b).padStart(3, '0')}${String.fromCharCode(65 + gi)}X0`.slice(0, 7);
          profiles.push(build(variant(base, g), ref));
          candidates.push({ ref, group: g.group, base: b });
        });
      }
      const scores = await scoreAll(matcher, mandate, profiles);
      scoredVariants += profiles.length;
      for (const c of candidates) {
        const s = scores.get(c.ref) ?? 0;
        const tally = counts.get(c.group)!;
        tally.n++;
        if (s >= threshold) tally.selected++;
      }
      // Invariance, once per base: identical blind inputs (same ref) and identical scores.
      if (mandate === syntheticMandates[0]) {
        for (let b = 0; b < bases; b++) {
          const base = syntheticBase(b);
          const sameRef = 'P000000';
          const inputs = groups.map((g) => JSON.stringify(build(variant(base, g), sameRef)));
          invariance.pairsChecked += groups.length - 1;
          const identical = inputs.every((x) => x === inputs[0]);
          if (identical) invariance.identicalInputs += groups.length - 1;
          else invariance.failures.push({ attribute, base: b, problem: 'blind inputs differ' });
          const groupScores = candidates
            .filter((c) => c.base === b)
            .map((c) => scores.get(c.ref) ?? -1);
          if (groupScores.every((x) => x === groupScores[0]))
            invariance.identicalScores += groups.length - 1;
          else invariance.failures.push({ attribute, base: b, problem: 'scores differ' });
        }
      }
    }
    const rates: GroupRate[] = groups.map((g) => {
      const t = counts.get(g.group)!;
      return { group: g.group, n: t.n, selected: t.selected, rate: t.n ? t.selected / t.n : 0 };
    });
    const max = Math.max(...rates.map((r) => r.rate));
    const min = Math.min(...rates.map((r) => r.rate));
    const impactRatio = max === 0 ? 1 : min / max;
    selection.push({ attribute, groups: rates, impactRatio, passes: impactRatio >= 0.8 });
  }

  const minimumImpactRatio = Math.min(...selection.map((s) => s.impactRatio));
  return {
    method:
      'Synthetic paired profiles: each base candidate copied into variants that differ only in protected-attribute signals; blind builder applied; four-fifths rule on selection rates (selected = fit midpoint ≥ threshold).',
    matcher: opts.matcherName ?? 'offline deterministic matcher',
    threshold,
    sample: {
      baseProfiles: bases,
      mandates: syntheticMandates.length,
      attributes: protectedAttributes.length,
      scoredVariants,
    },
    invariance,
    selection,
    minimumImpactRatio,
    passed: invariance.failures.length === 0 && selection.every((s) => s.passes),
  };
}
