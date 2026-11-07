import type { Currency, Market } from '@cmobeat/config';

/**
 * Small, deterministic text helpers for offline interview extraction. They never invent facts:
 * every value they return is read from the answer.
 */

const VAGUE =
  /^(?:n\/?a|na|tbd|tbc|idk|dunno|not sure|no idea|don'?t know|unsure|maybe|depends|we'?ll see|pass|skip|nothing|none yet|later|hmm+|ok(?:ay)?|yes|no)[.!?]*$/i;

/** True when an answer carries too little to use. */
export function isVague(answer: string, minWords = 4): boolean {
  const t = answer.trim();
  if (!t || VAGUE.test(t)) return true;
  return t.split(/\s+/).filter(Boolean).length < minWords;
}

const clean = (s: string) =>
  s
    .replace(/^\s*(?:[-•*]|\d+[.)]|[a-z][.)])\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.;,\s]+$/, '')
    .trim();

const capitalise = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/**
 * Split an answer into list items: bullets and numbered lines first, then semicolons, then
 * sentences. Items shorter than `minLength` are dropped.
 */
export function splitList(answer: string, minLength = 5): string[] {
  const text = answer.replace(/\r/g, '').trim();
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  let items: string[];
  if (lines.length > 1) items = lines;
  else if (text.includes(';')) items = text.split(';');
  else if (/(?:^|\s)\d+[.)]\s/.test(text)) items = text.split(/(?:^|\s)\d+[.)]\s+/);
  else items = text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  return items
    .map(clean)
    .map(capitalise)
    .filter((i) => i.length >= minLength);
}

/** First sentence-ish chunk, trimmed to `max` characters. */
export function firstClause(answer: string, max = 120): string {
  const c = clean(answer.split(/(?<=[.!?])\s+/)[0] ?? answer);
  return c.length > max ? `${c.slice(0, max - 1).trimEnd()}…` : c;
}

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  none: 0,
  no: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
};

/** A headcount-like integer from the answer, or null. */
export function firstCount(answer: string): number | null {
  const m = answer.match(
    /\b(\d{1,5})(?:\s*(?:people|person|marketers|reports|fte|heads?|strong))?\b/i,
  );
  if (m) return Number(m[1]);
  const w = answer
    .toLowerCase()
    .match(
      /\b(zero|none|no|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty)\b(?=\s+(?:people|person|marketers|reports|team|direct))/,
    );
  if (w) return WORD_NUMBERS[w[1]!]!;
  if (/\b(no team|from scratch|team of one|just me|nobody)\b/i.test(answer)) return 0;
  return null;
}

export function detectCurrency(text: string): Currency | null {
  const t = text.toLowerCase();
  if (/€|\beur\b|\beuros?\b/.test(t)) return 'EUR';
  if (/£|\bgbp\b|\bpounds?\b|\bsterling\b/.test(t)) return 'GBP';
  if (/\bcad\b|c\$|canadian dollars?/.test(t)) return 'CAD';
  if (/\$|\busd\b|\bdollars?\b/.test(t)) return 'USD';
  return null;
}

const MARKET_WORDS: [Market, RegExp][] = [
  ['UK', /\b(uk|united kingdom|britain|england|scotland|wales|london|manchester|edinburgh)\b/i],
  ['CA', /\b(canada|toronto|vancouver|montr[ée]al|ottawa|calgary)\b/i],
  [
    'EU',
    /\b(eu|europe|germany|berlin|munich|france|paris|netherlands|amsterdam|spain|madrid|barcelona|sweden|stockholm|ireland|dublin|italy|milan|denmark|copenhagen|portugal|lisbon)\b/i,
  ],
  [
    'US',
    /\b(us|usa|united states|america|new york|nyc|san francisco|sf|austin|boston|chicago|seattle|los angeles|miami|denver)\b/i,
  ],
];

export function detectMarket(text: string): Market | null {
  for (const [market, re] of MARKET_WORDS) if (re.test(text)) return market;
  return null;
}

export const currencyForMarket: Record<Market, Currency> = {
  US: 'USD',
  CA: 'CAD',
  EU: 'EUR',
  UK: 'GBP',
};
export const marketForCurrency: Record<Currency, Market> = {
  USD: 'US',
  CAD: 'CA',
  EUR: 'EU',
  GBP: 'UK',
};

const amount = (raw: string, suffix?: string) => {
  const n = Number(raw.replace(/,/g, ''));
  if (!suffix) return Math.round(n);
  return Math.round(/m/i.test(suffix) ? n * 1_000_000 : n * 1000);
};

/**
 * A compensation range from an answer: "$380k–$450k", "€12,000 to €16,000 a month", "around 400k".
 * Returns null when no money amount is present.
 */
export function parseComp(answer: string): {
  min: number;
  max: number;
  basis: 'annual' | 'monthly_retainer';
  currency: Currency | null;
} | null {
  const monthly =
    /\b(per month|a month|monthly|\/\s?mo(?:nth)?\b|retainer|per day|a day|day rate)/i.test(answer);
  const range = answer.match(
    /(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b\s*(?:–|-|—|to|and)\s*[$€£]?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b/i,
  );
  let min: number | null = null;
  let max: number | null = null;
  if (range) {
    min = amount(range[1]!, range[2] ?? range[4]);
    max = amount(range[3]!, range[4]);
  } else {
    const one = answer.match(
      /[$€£]\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b|(\d[\d,]*(?:\.\d+)?)\s*(k|m)\b/i,
    );
    if (one) min = max = amount(one[1] ?? one[3]!, one[2] ?? one[4]);
  }
  if (min === null || max === null) return null;
  if (min > max) [min, max] = [max, min];
  if (max < 1000) return null; // not money
  return {
    min,
    max,
    basis: monthly ? 'monthly_retainer' : 'annual',
    currency: detectCurrency(answer),
  };
}

export type Level = 'vp_marketing' | 'cmo' | 'chief_growth_officer' | 'fractional_cmo';

export function detectLevel(text: string): { level: Level; fractional: boolean } | null {
  const t = text.toLowerCase();
  const fractional =
    /\bfractional\b|\bpart[- ]time\b|\bdays? (?:a|per) (?:week|month)\b|\binterim\b/.test(t);
  if (/chief growth officer|\bcgo\b/.test(t)) return { level: 'chief_growth_officer', fractional };
  if (/\bvp\b|vice president|head of marketing/.test(t) && !/chief marketing|\bcmo\b/.test(t))
    return { level: 'vp_marketing', fractional };
  if (/chief marketing|\bcmo\b/.test(t))
    return { level: fractional ? 'fractional_cmo' : 'cmo', fractional };
  if (fractional) return { level: 'fractional_cmo', fractional };
  return null;
}

export const titleForLevel: Record<Level, string> = {
  vp_marketing: 'VP Marketing',
  cmo: 'Chief Marketing Officer',
  chief_growth_officer: 'Chief Growth Officer',
  fractional_cmo: 'Fractional CMO',
};

/** Who the role reports to, normalised. */
export function detectReportingLine(text: string): string | null {
  const t = text.toLowerCase();
  // An explicit "report(s) to the board/chair" wins over a CEO mentioned elsewhere in the answer.
  if (/report(?:s|ing)?\s+(?:directly\s+)?to\s+(?:the\s+)?(?:board|chair)/.test(t))
    return 'The board';
  if (/\b(ceo|chief executive)\b/.test(t))
    return /\bboard\b/.test(t) ? 'CEO, with a dotted line to the board' : 'CEO';
  if (/\bfounders?\b/.test(t)) return 'Founder';
  if (/\bboard\b|\bchair\b/.test(t)) return 'The board';
  if (/\b(coo|chief operating)\b/.test(t)) return 'COO';
  if (/\bpresident\b/.test(t)) return 'President';
  if (/\b(cro|chief revenue)\b/.test(t)) return 'CRO';
  if (/\b(cco|chief commercial)\b/.test(t)) return 'Chief Commercial Officer';
  if (/\b(gm|general manager)\b/.test(t)) return 'General Manager';
  return null;
}
