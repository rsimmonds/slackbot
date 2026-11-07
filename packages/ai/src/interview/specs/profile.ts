import { ProfilePortfolioSchema, type Outcome, type ProfilePortfolio } from '../../schemas/profile';
import type { FieldSpec, InterviewSpec } from '../types';
import { scrubAnswer, splitSentences } from './scrub';

/**
 * Profile Interviewer (spec 5.4.1, 7): builds a proof-of-outcomes portfolio, one question at a time.
 *
 * It never asks about, and its extractors never keep, age, gender, pronouns, nationality,
 * ethnicity, religion, disability, family status, graduation years or photos. Every answer passes
 * through scrubAnswer() before extraction. The candidate approves every line before anything is saved.
 */

type Level = ProfilePortfolio['level'];
type Ideal = ProfilePortfolio['idealMandate'];

export interface ProfileDraft {
  headline?: string;
  level?: Level;
  yearsExperience?: number | null;
  /** Keyed by the question that produced it, so a follow-up replaces rather than duplicates. */
  outcomesByField?: Record<string, Outcome>;
  teamBuilds?: string[];
  aiFluency?: string | null;
  ideal?: Partial<Ideal>;
  /** Attributes removed from answers (names only), shown to the candidate at review. */
  scrubbed?: string[];
}

// ---------------------------------------------------------------- extraction helpers

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Short or non-committal answers get a follow-up rather than a guess. */
export function isVague(answer: string, minWords = 6): boolean {
  const a = answer.trim().toLowerCase();
  if (!a) return true;
  if (/^(n\/?a|none|no|not sure|idk|i don'?t know|pass|skip|nothing|-)\.?$/.test(a)) return true;
  return words(a) < minWords;
}

const NUMBER =
  /(?:[$€£]\s?\d[\d,.]*\s?(?:(?:k|m|mm|bn|b|million|billion)\b)?|\d[\d,.]*\s?(?:%|(?:x|×|pts?|points|k|m|mm|bn|million|billion|people|reports|hires|markets|countries|weeks|months|days)\b)?(?:\s?(?:to|→|->)\s?[$€£]?\d[\d,.]*\s?(?:%|(?:x|k|m|mm|bn|million|billion)\b)?)?)/i;

/** "from 18% to 46%" → "18% to 46%"; "3x" → "3x"; "$4.2M ARR" → "$4.2M". Numbers kept as stated. */
export function extractValue(text: string): string | null {
  const fromTo = text.match(
    /from\s+([$€£]?\d[\d,.]*\s?(?:%|(?:x|×|k|m|mm|bn|b|million|billion|days|weeks|months)\b)?)\s+to\s+([$€£]?\d[\d,.]*\s?(?:%|(?:x|×|k|m|mm|bn|b|million|billion|days|weeks|months)\b)?)/i,
  );
  if (fromTo) return `${fromTo[1]!.trim()} to ${fromTo[2]!.trim()}`;
  const m = text.match(NUMBER);
  if (!m) return null;
  const v = m[0].trim();
  // A lone small integer with no unit ("2", "3") is not a measurable result.
  if (/^\d{1,2}$/.test(v)) return null;
  // Bare four-digit years are dates, not results.
  if (/^(19|20)\d{2}$/.test(v)) return null;
  return v;
}

const TIMEFRAME =
  /\b(?:in|over|within|across|during)\s+(?:the\s+)?(?:first\s+)?(?:\d+|one|two|three|four|five|six|eighteen|twelve)\s+(?:years?|months?|quarters?|weeks?)\b|\b(?:year|quarter)\s+(?:one|two|1|2)\b/i;

/** The sentence carrying the number, with the number and timeframe removed, as the metric. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function metricFrom(sentence: string, value: string): string {
  let m = sentence
    .replace(new RegExp(`(?:\\b(?:from|by|of)\\s+)?${escapeRe(value)}`, 'i'), '')
    .replace(/\bfrom\s+[$€£]?\d[\d,.%x ]*\s+to\s+[$€£]?\d[\d,.%x ]*/i, '')
    .replace(TIMEFRAME, '')
    .replace(
      /\b(i|we|my team|our team)\s+(grew|took|cut|raised|increased|reduced|lifted|moved|drove|improved|doubled|tripled|built)\b/i,
      '$2',
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/\b(from|by|to|of)\s*$/i, '')
    .replace(/^[\s,;:-]+|[\s,;:.-]+$/g, '');
  m = m.charAt(0).toUpperCase() + m.slice(1);
  return m.length > 90 ? `${m.slice(0, 87).trimEnd()}…` : m || 'Result';
}

/**
 * Remove employer names introduced by "at" or "joined" ("VP Marketing at Northwind Labs").
 * Deliberately narrow: "Head of Marketing" and "for B2B SaaS" are left alone.
 */
export function withoutEmployerNames(text: string): string {
  return text
    .replace(/\s+(?:at|joined)\s+(?:[A-Z][\w&'.-]*)(?:\s+(?:[A-Z][\w&'.-]*|&))*(?=[\s,.;]|$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const LEVELS: { level: Level; pattern: RegExp }[] = [
  { level: 'fractional_cmo', pattern: /\bfractional\b/i },
  { level: 'chief_growth_officer', pattern: /chief growth officer|\bcgo\b/i },
  { level: 'cmo', pattern: /chief marketing officer|\bcmo\b|chief (brand|customer) officer/i },
  {
    level: 'vp_marketing',
    pattern: /\b(vp|vice president|head of|svp|evp)\b[^.]{0,20}(marketing|growth|brand|demand)/i,
  },
];

export function extractLevel(text: string): Level | null {
  return LEVELS.find((l) => l.pattern.test(text))?.level ?? null;
}

/** Years leading marketing. When several figures are given, the largest is the career total. */
export function extractYears(text: string): number | null {
  const all = [...text.matchAll(/\b(\d{1,2})\+?\s*(?:years?|yrs?)\b/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 0 && n <= 60);
  return all.length ? Math.max(...all) : null;
}

/** "Series B, growth stage and pre-IPO" → canonical stage labels. */
export function extractStages(text: string): string[] {
  const t = text.toLowerCase();
  const found: string[] = [];
  const add = (s: string) => !found.includes(s) && found.push(s);
  if (/\bseed\b|pre-?seed/.test(t)) add('Seed');
  if (/series\s*a\b/.test(t)) add('Series A');
  if (/series\s*b\b/.test(t)) add('Series B');
  if (/series\s*c\b|series\s*d\b|late[- ]stage/.test(t)) add('Series C+');
  if (/growth[- ]stage|scale-?up|scaling/.test(t)) add('Growth');
  if (/pre-?ipo/.test(t)) add('Pre-IPO');
  if (/\bpublic\b|listed|nasdaq|nyse|ftse|tsx/.test(t)) add('Public');
  if (/private equity|pe-backed|\bpe\b/.test(t)) add('PE-backed');
  return found.slice(0, 4);
}

const INDUSTRY_WORDS: [RegExp, string][] = [
  [/\bb2b saas|\bsaas\b|software/i, 'B2B SaaS'],
  [/fintech|payments|banking/i, 'Fintech'],
  [/health|medtech|biotech|pharma/i, 'Health'],
  [/consumer|cpg|retail|e-?commerce|dtc|d2c/i, 'Consumer'],
  [/marketplace/i, 'Marketplaces'],
  [/security|cyber/i, 'Security'],
  [/climate|energy|cleantech/i, 'Climate'],
  [/media|publishing|entertainment/i, 'Media'],
  [/\bai\b|machine learning|data/i, 'AI and data'],
  [/industrial|manufactur|logistics|freight|mobility/i, 'Industrial'],
  [/education|edtech/i, 'Education'],
];

export function extractIndustries(text: string): string[] {
  return INDUSTRY_WORDS.filter(([re]) => re.test(text))
    .map(([, label]) => label)
    .slice(0, 6);
}

export function extractWorkTypes(text: string): Ideal['workTypes'] {
  const t = text.toLowerCase();
  const both = /\bboth\b|either/.test(t);
  const out: Ideal['workTypes'] = [];
  if (both || /full[- ]?time|permanent|in-?house/.test(t)) out.push('full_time');
  if (both || /fractional|part[- ]?time|interim|advisory/.test(t)) out.push('fractional');
  return out;
}

export function extractMarkets(text: string): Ideal['markets'] {
  const t = text.toLowerCase();
  const out: Ideal['markets'] = [];
  if (/\b(us|usa|united states|america|american)\b/.test(t)) out.push('US');
  if (/\b(canada|canadian|toronto|vancouver|montr[eé]al)\b/.test(t)) out.push('CA');
  if (/\b(eu|europe|european|berlin|paris|amsterdam|stockholm|madrid)\b/.test(t)) out.push('EU');
  if (/\b(uk|united kingdom|britain|london|england|scotland)\b/.test(t)) out.push('UK');
  if (/\b(anywhere|global|everywhere|all (four|markets))\b/.test(t))
    return ['US', 'CA', 'EU', 'UK'];
  return out;
}

export function extractReportingLine(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bceo\b|chief executive|founder/.test(t))
    return /founder/.test(t) && !/\bceo\b/.test(t) ? 'Founder' : 'CEO';
  if (/\bboard\b/.test(t)) return 'Board';
  if (/\bcoo\b|chief operating/.test(t)) return 'COO';
  if (/\bcro\b|chief revenue/.test(t)) return 'CRO';
  if (/\bpresident\b/.test(t)) return 'President';
  return null;
}

/** Split a list-ish answer ("a, b and c" / bullet lines) into short items. */
export function listItems(text: string, max = 5): string[] {
  return text
    .split(/\n|;|•|(?:,\s*(?:and\s+)?)|(?:\s+and\s+(?=[a-z]))/i)
    .map((s) =>
      s
        .replace(/^[-*\d.)\s]+/, '')
        .replace(/[.\s]+$/, '')
        .trim(),
    )
    .filter((s) => words(s) >= 2)
    .slice(0, max);
}

function outcomeFrom(answer: string, type: Outcome['outcomeType']): Outcome | null {
  const sentences = splitSentences(answer);
  const withNumber = sentences.find((s) => extractValue(s));
  if (!withNumber) return null;
  const value = extractValue(withNumber)!;
  const timeframe = answer.match(TIMEFRAME)?.[0] ?? null;
  const rest = sentences.filter((s) => s !== withNumber).join(' ');
  const evidence = answer.match(
    /\b(board (deck|pack|report)|audited|annual report|10-?k|crm|salesforce|hubspot|dashboard|investor update)\b[^.]*/i,
  );
  return {
    outcomeType: type,
    metric: withoutEmployerNames(metricFrom(withNumber, value)),
    value,
    context:
      [timeframe, withoutEmployerNames(rest).slice(0, 200)].filter(Boolean).join('. ') || null,
    evidenceNote: evidence ? evidence[0].trim().slice(0, 120) : null,
  };
}

const classifyOutcome = (text: string): Outcome['outcomeType'] => {
  const t = text.toLowerCase();
  if (/pipeline|demand|leads?|mqls?|sqls?|opportunit/.test(t)) return 'pipeline';
  if (/revenue|arr|bookings|sales|gmv|\bnrr\b/.test(t)) return 'revenue';
  if (/brand|awareness|positioning|nps|share of voice|consideration/.test(t)) return 'brand';
  if (/cac|payback|efficien|cost|spend|roas|budget/.test(t)) return 'efficiency';
  if (/launch|product|feature|adoption/.test(t)) return 'product';
  if (/market entry|new market|expan|launched in/.test(t)) return 'market_entry';
  if (/team|hire|hiring|org/.test(t)) return 'team';
  return 'other';
};

// ---------------------------------------------------------------- fields

/**
 * Wrap a field extractor so every answer is scrubbed first; scrubbed attribute names are recorded
 * on the draft (never the content) so the review screen can say what was left out and why.
 */
function scrubbed(
  extract: (clean: string, draft: Partial<ProfileDraft>) => Partial<ProfileDraft> | null,
): FieldSpec<ProfileDraft>['extract'] {
  return (answer, draft) => {
    const s = scrubAnswer(answer);
    const patch = s.text ? extract(s.text, draft) : null;
    if (!s.removed.length) return patch;
    const scrubbedNames = [...new Set([...(draft.scrubbed ?? []), ...s.removed])];
    return patch ? { ...patch, scrubbed: scrubbedNames } : null;
  };
}

function outcomeField(
  key: string,
  type: Outcome['outcomeType'] | 'auto',
  question: string,
  followUp: string,
): FieldSpec<ProfileDraft> {
  return {
    key,
    question,
    followUp,
    extract: scrubbed((a, d) => {
      const o = outcomeFrom(a, type === 'auto' ? classifyOutcome(a) : type);
      return o ? { outcomesByField: { ...(d.outcomesByField ?? {}), [key]: o } } : null;
    }),
    isComplete: (d) => !!d.outcomesByField?.[key],
  };
}

export const profileFields: FieldSpec<ProfileDraft>[] = [
  {
    key: 'role',
    question:
      'Let’s start with where you are now. What is your current or most recent role, and how many years have you led marketing?',
    followUp:
      'Could you give me the title, and roughly how many years you have led marketing teams?',
    extract: scrubbed((a) => {
      const level = extractLevel(a);
      if (!level) return null;
      return { level, yearsExperience: extractYears(a) };
    }),
    isComplete: (d) => !!d.level,
  },
  outcomeField(
    'outcome_signature',
    'auto',
    'Tell me about the result you are proudest of. What moved, by how much, and over what time?',
    'What was the number before, and after? An approximate figure is fine, as long as it is honest.',
  ),
  outcomeField(
    'outcome_pipeline',
    'pipeline',
    'Now demand. Which pipeline or demand metric did you change most, and from what to what?',
    'Which metric was it — sourced pipeline, qualified opportunities, win rate — and what were the before and after numbers?',
  ),
  outcomeField(
    'outcome_brand',
    'brand',
    'Tell me about a brand or positioning change you led. How did you know it worked?',
    'What evidence showed it worked? A measure such as awareness, consideration, price realisation or win rate helps.',
  ),
  outcomeField(
    'outcome_efficiency',
    'efficiency',
    'Where did you make marketing more efficient? Think CAC, payback, or spend against outcome.',
    'Can you put a number on it, such as CAC before and after, or payback in months?',
  ),
  {
    key: 'team',
    question: 'Which teams have you built or rebuilt? Give me the size and how long it took.',
    followUp: 'How many people, which functions, and over how many months?',
    extract: scrubbed((a) => {
      if (!/\d/.test(a) || isVague(a, 5)) return null;
      const items = listItems(withoutEmployerNames(a), 5).filter((i) => /\d/.test(i));
      return { teamBuilds: items.length ? items : [withoutEmployerNames(a).slice(0, 160)] };
    }),
    isComplete: (d) => !!d.teamBuilds?.length,
  },
  {
    key: 'ai_fluency',
    question: 'How do you and your team use AI in marketing today? Be specific about one workflow.',
    followUp: 'Which workflow changed, which tools, and what did it change in time or output?',
    extract: scrubbed((a) =>
      isVague(a, 8) ? null : { aiFluency: withoutEmployerNames(a).slice(0, 400) },
    ),
    isComplete: (d) => d.aiFluency !== undefined,
  },
  {
    key: 'headline',
    question: 'In one line, how would you describe the leader you are? Leave out employer names.',
    followUp:
      'Try one sentence: the kind of problem you are best at, and the stage where you do it.',
    extract: scrubbed((a) => {
      if (isVague(a, 5)) return null;
      const line = withoutEmployerNames(splitSentences(a)[0] ?? a).replace(/[.\s]+$/, '');
      return line.length >= 10 ? { headline: line.slice(0, 140) } : null;
    }),
    isComplete: (d) => !!d.headline,
  },
  {
    key: 'ideal_summary',
    question:
      'Describe the next mandate you want. What problem would you most like to be hired to solve?',
    followUp: 'What would the company need from you in the first year?',
    extract: scrubbed((a, d) =>
      isVague(a, 8)
        ? null
        : { ideal: { ...d.ideal, summary: withoutEmployerNames(a).slice(0, 400) } },
    ),
    isComplete: (d) => !!d.ideal?.summary,
  },
  {
    key: 'ideal_fit',
    question: 'Which company stages and industries fit you best?',
    followUp: 'For example: Series B to pre-IPO, B2B software or fintech. Which apply to you?',
    extract: scrubbed((a, d) => {
      const stages = extractStages(a);
      const industries = extractIndustries(a);
      if (!stages.length && !industries.length) return null;
      return { ideal: { ...d.ideal, stages, industries } };
    }),
    isComplete: (d) => d.ideal?.stages !== undefined,
  },
  {
    key: 'ideal_terms',
    question: 'Full-time, fractional, or both? And which markets: the US, Canada, Europe, the UK?',
    followUp: 'Please name the work type and at least one market.',
    extract: scrubbed((a, d) => {
      const workTypes = extractWorkTypes(a);
      const markets = extractMarkets(a);
      if (!workTypes.length || !markets.length) return null;
      return { ideal: { ...d.ideal, workTypes, markets } };
    }),
    isComplete: (d) => !!d.ideal?.workTypes?.length && !!d.ideal?.markets?.length,
  },
  {
    key: 'ideal_reporting',
    question: 'Who should the role report to?',
    followUp: 'The CEO, the board, a COO or someone else?',
    extract: scrubbed((a, d) => {
      const reportingLine = extractReportingLine(a);
      if (reportingLine) return { ideal: { ...d.ideal, reportingLine } };
      return /no preference|doesn'?t matter|flexible|open/i.test(a)
        ? { ideal: { ...d.ideal, reportingLine: null } }
        : null;
    }),
    isComplete: (d) => d.ideal?.reportingLine !== undefined,
  },
  {
    key: 'deal_breakers',
    question: 'Last one. What would make you turn down a role, however good it looks?',
    followUp:
      'Name one or two things, such as no budget authority or no seat at the leadership table.',
    extract: scrubbed((a, d) => {
      if (/\b(nothing|none|no deal ?breakers?)\b/i.test(a))
        return { ideal: { ...d.ideal, dealBreakers: [] } };
      const items = listItems(withoutEmployerNames(a), 5);
      return items.length ? { ideal: { ...d.ideal, dealBreakers: items } } : null;
    }),
    isComplete: (d) => d.ideal?.dealBreakers !== undefined,
  },
];

// ---------------------------------------------------------------- finalize

const levelTitle: Record<Level, string> = {
  vp_marketing: 'Marketing leader',
  cmo: 'CMO',
  chief_growth_officer: 'Chief Growth Officer',
  fractional_cmo: 'Fractional CMO',
};

/** Assemble the portfolio. Throws (via the schema) if required lines are missing. */
export function finalizeProfile(d: Partial<ProfileDraft>): ProfilePortfolio {
  const level = d.level ?? 'cmo';
  const outcomes = Object.values(d.outcomesByField ?? {});
  return ProfilePortfolioSchema.parse({
    headline:
      d.headline ??
      `${levelTitle[level]}. ${outcomes[0]?.metric ?? 'Proof of outcomes on request'}.`.slice(
        0,
        140,
      ),
    level,
    yearsExperience: d.yearsExperience ?? null,
    outcomes,
    teamBuilds: d.teamBuilds ?? [],
    aiFluency: d.aiFluency ?? null,
    idealMandate: {
      summary: d.ideal?.summary ?? 'To be confirmed with the candidate.',
      stages: d.ideal?.stages ?? [],
      industries: d.ideal?.industries ?? [],
      workTypes: d.ideal?.workTypes?.length ? d.ideal.workTypes : ['full_time'],
      markets: d.ideal?.markets?.length ? d.ideal.markets : ['US'],
      reportingLine: d.ideal?.reportingLine ?? null,
      dealBreakers: d.ideal?.dealBreakers ?? [],
    },
  });
}

export const profileInterview: InterviewSpec<ProfileDraft, ProfilePortfolio> = {
  kind: 'profile',
  agent: 'profile-interviewer',
  refPrefix: 'PI',
  maxQuestions: 15,
  fields: profileFields,
  schema: ProfilePortfolioSchema,
  finalize: finalizeProfile,
  intro:
    'Your answers are encrypted and visible to no one. You approve every line before it is saved.',
};
