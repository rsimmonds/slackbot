import { feeMinor, searchFeeTerms, type Currency, type SearchPlan } from '@cmobeat/config';
import { z } from 'zod';

/** The fee terms an employer accepted, stored on `searches.fee_terms`. Never recomputed later. */
export const feeTermsSnapshot = z.object({
  plan: z.enum(['ai_search', 'fractional_match']),
  version: z.string(),
  rateBps: z.number().int().nonnegative(),
  basis: z.enum(['first_year_cash_comp', 'monthly_retainer']),
  invoicing: z.enum(['on_placement', 'monthly']),
  currency: z.string(),
  acceptedAt: z.string(),
  acceptedBy: z.string().uuid(),
});
export type FeeTermsSnapshot = z.infer<typeof feeTermsSnapshot>;

export function snapshotTerms(
  plan: SearchPlan,
  currency: Currency,
  acceptedBy: string,
  now = new Date(),
): FeeTermsSnapshot {
  const t = searchFeeTerms[plan];
  return {
    plan,
    version: searchFeeTerms.version,
    rateBps: t.rateBps,
    basis: t.basis,
    invoicing: t.invoicing,
    currency,
    acceptedAt: now.toISOString(),
    acceptedBy,
  };
}

/** Reads the stored snapshot, falling back to current terms for legacy rows. */
export function termsOf(
  plan: SearchPlan,
  stored: unknown,
): Pick<FeeTermsSnapshot, 'rateBps' | 'basis' | 'invoicing'> {
  const parsed = feeTermsSnapshot.safeParse(stored);
  if (parsed.success) return parsed.data;
  const t = searchFeeTerms[plan];
  return { rateBps: t.rateBps, basis: t.basis, invoicing: t.invoicing };
}

export const ratePercent = (bps: number) =>
  `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

/** Fee for one invoice: the whole fee for a search, or one month for a fractional match. */
export function feeFor(plan: SearchPlan, stored: unknown, compWhole: number) {
  const { rateBps } = termsOf(plan, stored);
  return feeMinor(compWhole, rateBps);
}

export const planLabel: Record<SearchPlan, string> = {
  ai_search: searchFeeTerms.ai_search.label,
  fractional_match: searchFeeTerms.fractional_match.label,
};

export const planForWorkType = (workType: 'full_time' | 'fractional'): SearchPlan =>
  workType === 'fractional' ? 'fractional_match' : 'ai_search';

export function formatMinor(minor: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
}

export function formatWhole(whole: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(whole);
}
