import type { Currency } from './markets';

/**
 * Starting catalogue (spec 8.3). Stripe price IDs come from env so prices change without a deploy;
 * amounts here are display defaults in USD minor units.
 */
export const catalogue = {
  job_post_standard: { label: 'Job post, standard', type: 'one_time', days: 60, amount: 49_900 },
  job_post_featured: {
    label: 'Job post, featured CMO',
    type: 'one_time',
    days: 60,
    amount: 150_000,
  },
  employer_subscription: { label: 'Employer subscription', type: 'monthly', amount: 150_000 },
  candidate_concierge: { label: 'Candidate concierge', type: 'monthly', amount: 9_900 },
  ai_search: { label: 'AI-assisted search', type: 'success_fee', percent: 12 },
  fractional_match: { label: 'Fractional match', type: 'recurring_fee', percent: 15 },
  sponsorship: { label: 'Sponsorship, intelligence data', type: 'invoice' },
} as const;

export type ProductKey = keyof typeof catalogue;
export const catalogueCurrency: Currency = 'USD';

/**
 * Search fee terms (spec 8.3). Rates are basis points so maths stays in integers. A snapshot of
 * these terms is stored on every search when the employer accepts them, so later changes here
 * never alter an agreed search.
 */
export const searchFeeTerms = {
  version: '2026-11-07',
  ai_search: {
    label: 'AI-assisted search',
    rateBps: 1200,
    basis: 'first_year_cash_comp',
    invoicing: 'on_placement',
    workType: 'full_time',
    summary:
      'A success fee of 12% of the hire’s first-year cash compensation, invoiced once when they accept. Nothing is due if no one is hired.',
  },
  fractional_match: {
    label: 'Fractional match',
    rateBps: 1500,
    basis: 'monthly_retainer',
    invoicing: 'monthly',
    workType: 'fractional',
    summary:
      'A fee of 15% of the monthly retainer, invoiced each month while the engagement runs. It stops when the engagement ends.',
  },
} as const;

export type SearchPlan = 'ai_search' | 'fractional_match';

/**
 * Fee in minor units (cents) for an amount in whole currency units at a basis-point rate.
 * Rounds half up to the nearest minor unit. All launch currencies have two decimals.
 */
export function feeMinor(amountWhole: number, rateBps: number): number {
  if (!Number.isSafeInteger(amountWhole) || amountWhole < 0)
    throw new Error('Amount must be a non-negative whole number');
  if (!Number.isInteger(rateBps) || rateBps < 0) throw new Error('Rate must be whole basis points');
  const scaled = amountWhole * 100 * rateBps; // minor units × 10,000
  if (!Number.isSafeInteger(scaled)) throw new Error('Amount too large');
  return Math.floor((scaled + 5_000) / 10_000);
}
