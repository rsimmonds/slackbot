import { formatComp, type Currency } from '@cmobeat/config';

export const levelLabel = {
  cmo: 'Chief Marketing Officer',
  vp_marketing: 'VP Marketing',
  chief_growth_officer: 'Chief Growth Officer',
  fractional_cmo: 'Fractional CMO',
} as const;

export const marketLabel = {
  US: 'United States',
  CA: 'Canada',
  EU: 'Europe',
  UK: 'United Kingdom',
} as const;

export const workTypeLabel = { full_time: 'Full-time', fractional: 'Fractional' } as const;

/** Human names for document fields, used in "suggested" and "missing" notes. */
export const fieldLabel: Record<string, string> = {
  title: 'title',
  level: 'level',
  workType: 'work type',
  market: 'market',
  currency: 'currency',
  reportingLine: 'reporting line',
  summary: 'summary',
  priorities: 'priorities',
  scorecard: '90-day scorecard',
  interviewPlan: 'interview plan',
  compMin: 'comp range',
  compMax: 'comp range',
};

export function compRange(
  min: number | null,
  max: number | null,
  currency: Currency,
  basis: 'annual' | 'monthly_retainer',
): string | null {
  if (min === null || max === null) return null;
  return formatComp(min, max, currency, basis);
}

export const money = (n: number, currency: Currency) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(n);
