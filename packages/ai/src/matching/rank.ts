import { localEmbedding, cosine, tokens } from '../embeddings/provider';
import { readTagged, tagged } from '../format';
import {
  BlindMandateSchema,
  BlindProfileSchema,
  MatchRankingSchema,
  type BlindMandate,
  type BlindProfile,
  type MatchRanking,
} from '../schemas/match';
import { isStepUp, type Level } from './filters';

/** Text used for the mandate's embedding and the offline matcher. Never the company name. */
export function blindMandateText(m: BlindMandate): string {
  return [
    m.title,
    m.level.replace(/_/g, ' '),
    m.summary ?? '',
    ...m.priorities,
    m.reportingLine ? `reports to ${m.reportingLine}` : '',
    m.companyIndustry,
    m.companyStage,
  ]
    .filter(Boolean)
    .join('\n');
}

/** The Matcher's user turn: both inputs as tagged data, never as instructions. */
export function matcherUserMessage(mandate: BlindMandate, candidates: BlindProfile[]): string {
  return [
    tagged('mandate', JSON.stringify(mandate, null, 2)),
    tagged('candidates', JSON.stringify(candidates, null, 2)),
    `Rank up to 25 of these ${candidates.length} candidates for this mandate. Use only the refs given.`,
  ].join('\n\n');
}

export function readMatcherInput(user: string): {
  mandate: BlindMandate;
  candidates: BlindProfile[];
} {
  return {
    mandate: BlindMandateSchema.parse(JSON.parse(readTagged(user, 'mandate'))),
    candidates: BlindProfileSchema.array().parse(JSON.parse(readTagged(user, 'candidates'))),
  };
}

/**
 * Keep only rankings the pipeline can trust: refs that were in the input, once each, with an
 * ordered 0–100 range. Anything else is dropped, never repaired into a different candidate.
 */
export function sanitizeRanking(ranking: MatchRanking, refs: ReadonlySet<string>): MatchRanking {
  const seen = new Set<string>();
  const matches = [];
  for (const m of ranking.matches) {
    if (!refs.has(m.ref) || seen.has(m.ref)) continue;
    seen.add(m.ref);
    const lo = Math.max(0, Math.min(100, Math.min(m.scoreLow, m.scoreHigh)));
    const hi = Math.max(0, Math.min(100, Math.max(m.scoreLow, m.scoreHigh)));
    matches.push({ ...m, scoreLow: lo, scoreHigh: hi });
  }
  return MatchRankingSchema.parse({ matches: matches.slice(0, 25) });
}

// ------------------------------------------------------------------ offline matcher

const LEVEL_LABEL: Record<Level, string> = {
  cmo: 'CMO',
  chief_growth_officer: 'Chief Growth Officer',
  vp_marketing: 'VP Marketing',
  fractional_cmo: 'fractional CMO',
};

const THEMES: { theme: string; words: RegExp }[] = [
  {
    theme: 'pipeline and demand',
    words: /pipeline|demand|lead|opportunit|sourced|funnel|acquisition/,
  },
  { theme: 'brand and positioning', words: /brand|position|category|awareness|narrative|story/ },
  {
    theme: 'revenue growth',
    words:
      /revenue|arr\b|growth|bookings|sales|upmarket|expansion|retention|nrr|gmv|merchandise|purchase|conversion|ltv|lifetime value/,
  },
  { theme: 'efficiency', words: /cac|payback|efficien|cost|roi|spend|budget/ },
  { theme: 'team building', words: /team|hire|hiring|organi[sz]ation|leader|build/ },
  { theme: 'market entry', words: /launch|market entry|region|international|new market|expan/ },
  { theme: 'AI in marketing', words: /\bai\b|automation|model|machine/ },
];

const themesIn = (text: string) =>
  new Set(THEMES.filter((t) => t.words.test(text.toLowerCase())).map((t) => t.theme));

const includesAny = (haystack: string[], needle: string) =>
  haystack.some((h) => {
    const a = h.toLowerCase();
    const b = needle.toLowerCase();
    return a.includes(b) || b.includes(a);
  });

/**
 * Deterministic stand-in for the Matcher (offline, CI, fairness suite). It scores only blind
 * fields, so identical blind inputs always score identically. Fit is a range whose width grows
 * with uncertainty (few quantified outcomes, unstated preferences).
 */
export function rankOffline(mandate: BlindMandate, candidates: BlindProfile[]): MatchRanking {
  const mText = blindMandateText(mandate);
  const mVec = localEmbedding(mText);
  const mThemes = themesIn(`${mandate.priorities.join(' ')} ${mandate.summary ?? ''}`);
  const mWords = new Set(tokens(mandate.priorities.join(' ')));

  const scored = candidates.map((c) => {
    const outcomesText = c.outcomes
      .map((o) => `${o.metric} ${o.value} ${o.context ?? ''}`)
      .join(' ');
    const cText = `${outcomesText} ${c.teamBuilds.join(' ')} ${c.aiFluency ?? ''} ${c.ideal.summary}`;
    const sim = Math.max(0, cosine(mVec, localEmbedding(cText)));
    // Evidence is quantified outcomes (plus teams built and AI practice). Adjectives earn nothing.
    const quantifiedOutcomes = c.outcomes.filter((o) => /\d/.test(o.value));
    const quantified = quantifiedOutcomes.length;
    const evidence = [
      ...quantifiedOutcomes.map((o) => `${o.outcomeType} ${o.metric} ${o.value}`),
      ...c.teamBuilds,
      c.aiFluency ?? '',
    ].join(' ');
    const cThemes = themesIn(evidence);
    const shared = [...mThemes].filter((t) => cThemes.has(t));
    const missing = [...mThemes].filter((t) => !cThemes.has(t));
    const cWords = new Set(tokens(evidence));
    const wordOverlap = mWords.size
      ? [...mWords].filter((w) => cWords.has(w)).length / mWords.size
      : 0;

    const exactLevel = c.level === mandate.level ? 1 : 0.6;
    const industryKnown = c.ideal.industries.length > 0;
    const stageKnown = c.ideal.stages.length > 0;
    const industryFit = industryKnown
      ? includesAny(c.ideal.industries, mandate.companyIndustry)
        ? 1
        : 0
      : 0.5;
    const stageFit = stageKnown ? (includesAny(c.ideal.stages, mandate.companyStage) ? 1 : 0) : 0.5;
    const themeFit = mThemes.size ? shared.length / mThemes.size : 0.5;
    const strength = Math.min(quantified, 5) / 5;

    const center =
      100 *
      (0.2 * Math.min(1, sim / 0.4) +
        0.15 * exactLevel +
        0.1 * industryFit +
        0.1 * stageFit +
        0.2 * themeFit +
        0.1 * Math.min(1, wordOverlap * 2) +
        0.15 * strength);
    const width = 8 + 12 * (1 - strength) + (industryKnown ? 0 : 4) + (stageKnown ? 0 : 4);

    const reasons: { reason: string; direction: 'for' | 'against' }[] = [];
    for (const t of shared.slice(0, 2))
      reasons.push({
        reason: `Has quantified results in ${t}, which the mandate prioritises.`,
        direction: 'for',
      });
    if (c.level === mandate.level)
      reasons.push({
        reason: `Already operating at ${LEVEL_LABEL[mandate.level]} level.`,
        direction: 'for',
      });
    if (industryKnown && industryFit === 1)
      reasons.push({ reason: 'Wants this industry next.', direction: 'for' });
    if (isStepUp(mandate.level, c.level))
      reasons.push({
        reason: `Would be a step up from VP to ${LEVEL_LABEL[mandate.level]}.`,
        direction: 'against',
      });
    for (const t of missing.slice(0, 1))
      reasons.push({ reason: `No direct evidence yet of results in ${t}.`, direction: 'against' });
    if (industryKnown && industryFit === 0)
      reasons.push({
        reason: 'This industry is not among their stated preferences.',
        direction: 'against',
      });
    if (quantified < 3)
      reasons.push({
        reason: 'Fewer than three quantified outcomes, so the range is wide.',
        direction: 'against',
      });
    if (!reasons.some((r) => r.direction === 'for'))
      reasons.unshift({ reason: 'Level and work type fit the mandate.', direction: 'for' });
    if (!reasons.some((r) => r.direction === 'against'))
      reasons.push({
        reason: 'Outcomes are self-reported and not yet verified.',
        direction: 'against',
      });

    const lo = Math.max(0, Math.round(center - width / 2));
    const hi = Math.min(100, Math.round(center + width / 2));
    const summary = shared.length
      ? `Outcomes in ${shared.join(' and ')} line up with what this mandate needs most.`
      : 'Fits the level and work type; outcomes only partly overlap the mandate’s priorities.';
    return {
      ref: c.ref,
      scoreLow: lo,
      scoreHigh: hi,
      summary,
      reasons: reasons.slice(0, 6),
      center,
    };
  });

  scored.sort((a, b) => b.center - a.center || a.ref.localeCompare(b.ref));
  return MatchRankingSchema.parse({
    matches: scored.slice(0, 25).map(({ center: _c, ...m }) => m),
  });
}

/** The offline fallback for the `matcher` step (FakeProvider). */
export const matcherFallback = (req: { user: string }): MatchRanking => {
  const { mandate, candidates } = readMatcherInput(req.user);
  return rankOffline(mandate, candidates);
};
