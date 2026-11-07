import type { Market } from '@cmobeat/config';
import { scrubAnswer, stripContact } from '../interview/specs/scrub';
import { BlindProfileSchema, type BlindProfile } from '../schemas/match';
import type { Outcome } from '../schemas/profile';
import type { Level, WorkType } from './filters';

/**
 * Blind matching (spec 7.1.4): build what the Matcher may see about a candidate.
 *
 * Input is approved profile data only. Output never carries a name, photo, contact detail,
 * employer name, URL, year, years of experience, or any protected attribute. Every free-text
 * field passes through the same cleaner, so two candidates who differ only in protected
 * attributes produce byte-identical blind profiles (tested in the fairness suite).
 */
export interface RawOutcome {
  outcomeType: string;
  metric: string;
  value: string;
  context: string | null;
}

export interface RawIdeal {
  summary?: string | null;
  stages?: string[];
  industries?: string[];
  workTypes?: WorkType[];
  markets?: Market[];
  reportingLine?: string | null;
}

export interface RawProfileForBlind {
  level: Level;
  outcomes: RawOutcome[];
  ideal: RawIdeal | null;
  /** Fallbacks when the candidate has not stated an ideal mandate. */
  workTypes: WorkType[];
  markets: Market[];
  /**
   * Strings that identify the person or an employer: the candidate's display name, their
   * current company, and every company name on the platform. Removed wherever they appear.
   */
  identifiers: string[];
}

/** Gendered words → neutral ones. Case is preserved ("She" → "They"). */
const PRONOUNS: [RegExp, string][] = [
  [/\b(he|she)\b/gi, 'they'],
  [/\b(him)\b/gi, 'them'],
  [/\b(his|hers|her)\b/gi, 'their'],
  [/\b(himself|herself)\b/gi, 'themself'],
  [/\b(chair(wo)?man|chairperson)\b/gi, 'chair'],
  [/\b(business(wo)?man|businessperson)\b/gi, 'executive'],
  [/\b(spokes(wo)?man)\b/gi, 'spokesperson'],
];
const HONORIFICS = /\b(mr|mrs|ms|miss|mx|sir|madam)\.?\s+/gi;

const matchCase = (sub: string) => (m: string) =>
  m[0] === m[0]!.toUpperCase() ? sub[0]!.toUpperCase() + sub.slice(1) : sub;

/**
 * A second, stricter layer on top of the interview scrubber, for matching only: sentences that
 * state a nationality, ethnicity or faith in forms the general scrubber does not catch.
 */
const NATIONALITIES =
  'american|canadian|british|english|scottish|welsh|irish|french|german|dutch|belgian|swedish|danish|norwegian|finnish|spanish|portuguese|italian|greek|polish|romanian|ukrainian|russian|turkish|israeli|iranian|indian|pakistani|bangladeshi|sri lankan|chinese|japanese|korean|vietnamese|filipino|thai|indonesian|malaysian|singaporean|australian|new zealander|mexican|brazilian|argentinian|colombian|chilean|peruvian|nigerian|ghanaian|kenyan|south african|egyptian|moroccan|ethiopian|jamaican';
const BLIND_PROTECTED: RegExp[] = [
  new RegExp(`\\b(i am|i'm|as an?|proud(ly)?)\\s+(an?\\s+)?(${NATIONALITIES})\\b`, 'i'),
  new RegExp(`\\b(${NATIONALITIES})[- ](born|national|citizen|immigrant)\\b`, 'i'),
  /\b(first[- ]generation|second[- ]generation|immigrated|emigrated|moved here from|native country|home country)\b/i,
  /\b(black|white|asian|indigenous|first nations|aboriginal|arab|caucasian|african[- ]american|south asian|east asian|bipoc|person of colou?r)\s+(leader|executive|woman|man|marketer|cmo|professional|founder)s?\b/i,
  /\b(my (faith|religion|church|mosque|synagogue|temple|gurdwara)|observant|devout|kosher|halal|ramadan|sabbath)\b/i,
  /\b(wheelchair|hard of hearing|disabilit\w*|chronic (illness|pain|condition)|accessibility needs|(i am|i'm) (blind|deaf|disabled))\b/i,
  /\b(\d{2}\s*years?[\s-]*old|my age|(i am|i'm) (older|younger)|grand(mother|father|parent|child)\w*|retir(ed|ing|ement))\b/i,
];

const dropSentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((s) => !BLIND_PROTECTED.some((re) => re.test(s)))
    .join(' ');

/** Years and dates can reveal age ("since 1998", "class of 2004"). Remove them. */
const YEARS = [
  /\b(since|in|from|until|by|during|circa|c\.)\s+(19|20)\d{2}s?\b/gi,
  /\b(19|20)\d{2}\s*[–-]\s*((19|20)\d{2}|present|today|now)\b/gi,
  /\b(19|20)\d{2}s?\b/g,
  /\b\d{1,2}\+?\s*(years?|yrs?)\s+(of\s+)?(experience|in marketing|leading|in the industry)\b/gi,
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build one cleaner for a candidate: identifiers become a single case-insensitive pattern. */
export function makeCleaner(identifiers: readonly string[]) {
  const parts = new Set<string>();
  for (const id of identifiers) {
    const trimmed = id.trim();
    if (trimmed.length < 2) continue;
    parts.add(escapeRe(trimmed));
    // Each part of a personal or company name on its own ("Harper", "Halvard").
    for (const token of trimmed.split(/\s+/)) {
      if (token.length >= 3 && /^[\p{Lu}]/u.test(token) && !GENERIC.has(token.toLowerCase()))
        parts.add(escapeRe(token));
    }
  }
  const sorted = [...parts].sort((a, b) => b.length - a.length);
  const idPattern = sorted.length ? new RegExp(`\\b(${sorted.join('|')})\\b`, 'giu') : null;

  return (text: string | null | undefined): string => {
    if (!text) return '';
    let out = scrubAnswer(dropSentences(text)).text;
    out = stripContact(out);
    if (idPattern) out = out.replace(idPattern, '');
    out = out.replace(HONORIFICS, '');
    for (const re of YEARS) out = out.replace(re, '');
    for (const [re, sub] of PRONOUNS) out = out.replace(re, matchCase(sub));
    return out
      .replace(/\(\s*\)/g, '')
      .replace(/\s+([,.;:])/g, '$1')
      .replace(/([,;:])\1+/g, '$1')
      .replace(/^[\s,;:.-]+|[\s,;:-]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };
}

/** Company-name words too common to strip on their own ("Health", "Systems"). */
const GENERIC = new Set(
  'the and group holdings systems health labs software technologies technology partners capital media studios energy foods brands bank pay mobility robotics climate security marketplaces freight inc ltd llc corp company co gmbh plc ab sa'.split(
    ' ',
  ),
);

const OUTCOME_TYPES = new Set<Outcome['outcomeType']>([
  'revenue',
  'pipeline',
  'brand',
  'efficiency',
  'team',
  'product',
  'market_entry',
  'other',
]);

function outcomeType(t: string): Outcome['outcomeType'] {
  const k = t.toLowerCase();
  if (OUTCOME_TYPES.has(k as Outcome['outcomeType'])) return k as Outcome['outcomeType'];
  if (k === 'launch') return 'market_entry';
  if (k === 'retention') return 'revenue';
  return 'other';
}

const byText = (a: { metric: string; value: string }, b: { metric: string; value: string }) =>
  `${a.metric} ${a.value}`.localeCompare(`${b.metric} ${b.value}`);

export function buildBlindProfile(raw: RawProfileForBlind, ref: string): BlindProfile {
  const clean = makeCleaner(raw.identifiers);
  const outcomes: BlindProfile['outcomes'] = [];
  const teamBuilds: string[] = [];
  let aiFluency: string | null = null;

  for (const o of [...raw.outcomes].sort((a, b) => byText(a, b))) {
    const metric = clean(o.metric);
    const value = clean(o.value);
    const context = clean(o.context) || null;
    const type = o.outcomeType.toLowerCase();
    if (type === 'ai' || type === 'ai_fluency') {
      const text = [metric, value].filter(Boolean).join(': ');
      if (text) aiFluency = aiFluency ? `${aiFluency} ${text}` : text;
      continue;
    }
    if (type === 'team' && teamBuilds.length < 5) {
      const text = [metric, value].filter(Boolean).join(': ');
      if (text) teamBuilds.push(text);
    }
    if (metric.length < 2 || value.length < 1) continue;
    if (outcomes.length < 10)
      outcomes.push({ outcomeType: outcomeType(type), metric, value, context });
  }

  const ideal = raw.ideal ?? {};
  const list = (xs: string[] | undefined) =>
    [...new Set((xs ?? []).map((x) => clean(x)).filter(Boolean))].sort();

  return BlindProfileSchema.parse({
    ref,
    level: raw.level,
    outcomes,
    teamBuilds,
    aiFluency,
    ideal: {
      summary: clean(ideal.summary),
      stages: list(ideal.stages),
      industries: list(ideal.industries),
      workTypes: [...new Set(ideal.workTypes?.length ? ideal.workTypes : raw.workTypes)].sort(),
      markets: [...new Set(ideal.markets?.length ? ideal.markets : raw.markets)].sort(),
      reportingLine: clean(ideal.reportingLine) || null,
    },
  });
}

/** Opaque per-run reference, e.g. "P7Q2K9A". Never derived from the profile id. */
export function randomRef(random: () => number = Math.random): string {
  const alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = 'P';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(random() * alphabet.length)];
  return s;
}

/** Text used for the candidate's embedding: blind fields only. */
export function blindProfileText(p: BlindProfile): string {
  return [
    p.level.replace(/_/g, ' '),
    ...p.outcomes.map((o) => `${o.outcomeType} ${o.metric} ${o.value} ${o.context ?? ''}`),
    ...p.teamBuilds,
    p.aiFluency ?? '',
    p.ideal.summary,
    p.ideal.stages.join(' '),
    p.ideal.industries.join(' '),
    p.ideal.reportingLine ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}
