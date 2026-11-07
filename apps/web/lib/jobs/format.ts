import { formatComp, type CompBasis, type Currency, type Market } from '@cmobeat/config';
import type { FunctionScope, JobFilters } from './filters';

export const levelLabel: Record<string, string> = {
  cmo: 'CMO',
  vp_marketing: 'VP Marketing',
  chief_growth_officer: 'Chief Growth Officer',
  fractional_cmo: 'Fractional CMO',
};

export const workTypeLabel: Record<string, string> = {
  full_time: 'Full-time',
  fractional: 'Fractional',
};

export const marketLabel: Record<Market, string> = {
  US: 'United States',
  CA: 'Canada',
  EU: 'Europe',
  UK: 'United Kingdom',
};

export const scopeLabel: Record<FunctionScope, string> = {
  brand: 'Brand',
  demand: 'Demand',
  product_marketing: 'Product marketing',
  growth: 'Growth',
  communications: 'Communications',
};

/**
 * "$380K–$450K", "CA$300K–CA$380K" or "€12K–€16K / mo". Always shows currency and basis.
 * One locale for every currency, so compact notation reads the same everywhere (en-GB would give "£217k").
 */
export function compLabel(
  min: number | null,
  max: number | null,
  currency: Currency,
  basis: CompBasis,
): string {
  if (min === null || max === null) return 'Comp not set';
  return formatComp(min, max, currency, basis, 'en-US');
}

export const compBasisLabel = (basis: CompBasis) =>
  basis === 'monthly_retainer' ? 'Monthly retainer' : 'Annual base';

/** Plain-English summary of a set of filters, used for saved searches and alert emails. */
export function describeFilters(f: Partial<JobFilters>): string {
  const parts: string[] = [];
  if (f.level) parts.push(levelLabel[f.level]!);
  if (f.work) parts.push(workTypeLabel[f.work]!);
  if (f.scope) parts.push(scopeLabel[f.scope]);
  if (f.industry) parts.push(f.industry);
  if (f.stage) parts.push(f.stage);
  if (f.market) parts.push(marketLabel[f.market]);
  if (f.remote) parts.push('Remote');
  if (f.currency && f.minComp) parts.push(`${f.currency} ${Math.round(f.minComp / 1000)}K+`);
  else if (f.currency) parts.push(f.currency);
  if (f.q) parts.push(`“${f.q}”`);
  return parts.length ? parts.join(' · ') : 'All roles';
}
