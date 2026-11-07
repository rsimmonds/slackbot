import { formatComp, type CompBasis, type Currency } from '@cmobeat/config';

export type Level = 'vp_marketing' | 'cmo' | 'chief_growth_officer' | 'fractional_cmo';
export type MoveType = 'appointed' | 'departed' | 'promoted';
export type MarketCode = 'US' | 'CA' | 'EU' | 'UK';

export const levelLabel: Record<Level, string> = {
  vp_marketing: 'VP Marketing',
  cmo: 'CMO',
  chief_growth_officer: 'Chief Growth Officer',
  fractional_cmo: 'Fractional CMO',
};

export const moveTypeLabel: Record<MoveType, string> = {
  appointed: 'Appointed',
  departed: 'Departed',
  promoted: 'Promoted',
};

export const marketLabel: Record<MarketCode, string> = {
  US: 'United States',
  CA: 'Canada',
  EU: 'European Union',
  UK: 'United Kingdom',
};

/** Comp always carries its currency code so ranges in different currencies are never confused. */
export function compLabel(
  min: number | null,
  max: number | null,
  currency: Currency,
  basis: CompBasis,
): string {
  if (min == null || max == null) return 'Comp not stated';
  // en-US formatting everywhere so compact suffixes are consistent ($, CA$, €, £ with K).
  return `${formatComp(min, max, currency, basis, 'en-US')} ${currency}`;
}

export function formatDate(d: string | Date, style: 'long' | 'short' = 'long'): string {
  const date = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** ISO date (YYYY-MM-DD) in UTC. */
export const isoDate = (d: string | Date) =>
  (typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d)
    .toISOString()
    .slice(0, 10);

/** Rough reading time at 230 words a minute. */
export function readingMinutes(mdx: string): number {
  return Math.max(1, Math.round(mdx.split(/\s+/).filter(Boolean).length / 230));
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
