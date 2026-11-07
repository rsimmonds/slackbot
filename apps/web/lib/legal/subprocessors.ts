/**
 * Subprocessors (spec 9.8, 9.9). One typed list drives /legal/subprocessors and llms.txt-style
 * disclosures. Add a provider here before any code sends it data. Regions are the intended
 * configuration and are pending legal review (LEGAL_REVIEW.md P1).
 */
export interface Subprocessor {
  name: string;
  purpose: string;
  /** What we send them. */
  data: string;
  region: string;
  /** Not used yet; listed so the notice is ready before launch. */
  planned?: boolean;
}

export const subprocessors: Subprocessor[] = [
  {
    name: 'Anthropic',
    purpose:
      'AI models (Claude) for the Listing Parser, Moves Tracker, Mandate Builder, Profile Interviewer, Matcher and Editorial Assistant.',
    data: 'Job descriptions, public news text, interview answers. Matching inputs have names and protected attributes removed first.',
    region: 'United States',
  },
  {
    name: 'Voyage AI',
    purpose: 'Text embeddings for search and matching.',
    data: 'Anonymized outcomes, mandates and published articles.',
    region: 'United States',
    planned: true,
  },
  {
    name: 'Supabase',
    purpose: 'Database and encrypted file storage.',
    data: 'All account, profile, listing and editorial data. Sensitive fields encrypted before storage.',
    region: 'United States; EU region for EU data under review',
  },
  {
    name: 'Vercel',
    purpose: 'Hosting and content delivery.',
    data: 'Web requests, including IP addresses, transiently.',
    region: 'Global edge network',
  },
  {
    name: 'Clerk',
    purpose: 'Sign-in, multi-factor authentication and sessions.',
    data: 'Email address, name, sign-in method, device and session data.',
    region: 'United States',
  },
  {
    name: 'Stripe',
    purpose: 'Payments, invoices and subscriptions.',
    data: 'Billing contact, company details and payment information (held by Stripe, not by us).',
    region: 'United States; Ireland for EU customers',
  },
  {
    name: 'Resend',
    purpose: 'Transactional email and the newsletter.',
    data: 'Email address, newsletter preferences, message content.',
    region: 'United States',
  },
  {
    name: 'Inngest',
    purpose: 'Scheduled and background jobs.',
    data: 'Job identifiers and the minimum data each job needs.',
    region: 'United States',
  },
  {
    name: 'Sentry',
    purpose: 'Error monitoring.',
    data: 'Error reports with personal data scrubbed.',
    region: 'United States',
    planned: true,
  },
  {
    name: 'PostHog',
    purpose: 'Product analytics, only with your consent.',
    data: 'Pages viewed and actions taken. Never candidate data.',
    region: 'EU (Frankfurt)',
    planned: true,
  },
];
