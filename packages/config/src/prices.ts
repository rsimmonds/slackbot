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
