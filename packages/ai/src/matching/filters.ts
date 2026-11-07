import type { Currency, Market } from '@cmobeat/config';

/**
 * Stage one of two-stage retrieval (spec 7.1.5): hard constraints. Pure functions so the SQL
 * pipeline, the evals and the fairness suite all apply exactly the same rules.
 */
export type Level = 'vp_marketing' | 'cmo' | 'chief_growth_officer' | 'fractional_cmo';
export type WorkType = 'full_time' | 'fractional';

/** Which candidate levels a mandate at each level may consider. Includes one-step step-ups. */
export const levelCompatibility: Record<Level, readonly Level[]> = {
  cmo: ['cmo', 'chief_growth_officer', 'vp_marketing'],
  chief_growth_officer: ['chief_growth_officer', 'cmo', 'vp_marketing'],
  vp_marketing: ['vp_marketing', 'cmo'],
  fractional_cmo: ['fractional_cmo', 'cmo', 'chief_growth_officer'],
};

/** A VP Marketing considered for a C-level seat is a step up: shown as a reason against. */
export const isStepUp = (mandate: Level, candidate: Level) =>
  candidate === 'vp_marketing' && mandate !== 'vp_marketing';

const EU = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
]);

/** Profile locations ("US", "GB", "Remote", "Toronto, ON") → launch markets. */
export function marketsFromLocations(locations: readonly string[]): {
  markets: Market[];
  remote: boolean;
} {
  const markets = new Set<Market>();
  let remote = false;
  for (const raw of locations) {
    const l = raw.trim().toUpperCase();
    if (l === 'REMOTE') remote = true;
    else if (l === 'US' || l === 'USA') markets.add('US');
    else if (l === 'CA' || l === 'CANADA') markets.add('CA');
    else if (l === 'GB' || l === 'UK') markets.add('UK');
    else if (l === 'EU' || EU.has(l)) markets.add('EU');
  }
  return { markets: [...markets], remote };
}

export interface CompFloor {
  amount: number;
  currency: Currency;
  basis: 'annual' | 'monthly_retainer';
}

export interface CandidateFacts {
  level: Level;
  workTypes: readonly WorkType[];
  markets: readonly Market[];
  remoteOk: boolean;
  /** Decrypted only inside the matching pipeline; never logged or stored. */
  compFloor: CompFloor | null;
}

export interface MandateFacts {
  level: Level;
  workType: WorkType;
  market: Market;
  remote: boolean;
  compMax: number | null;
  currency: Currency;
  compBasis: 'annual' | 'monthly_retainer';
}

export type FilterResult = { pass: true } | { pass: false; reason: string };

export function hardFilter(m: MandateFacts, c: CandidateFacts): FilterResult {
  if (!levelCompatibility[m.level].includes(c.level)) return { pass: false, reason: 'level' };
  if (!c.workTypes.includes(m.workType)) return { pass: false, reason: 'work_type' };
  if (!c.markets.includes(m.market) && !(m.remote && c.remoteOk))
    return { pass: false, reason: 'market' };
  // Comp overlap only when comparable: same currency and pay basis. Never converted.
  const f = c.compFloor;
  if (f && m.compMax !== null && f.currency === m.currency && f.basis === m.compBasis) {
    if (f.amount > m.compMax) return { pass: false, reason: 'comp' };
  }
  return { pass: true };
}
