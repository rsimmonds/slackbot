import type { NavLink } from '@/components/AreaShell';

/** Navigation for each area. One place, so every workstream links consistently. */
export const publicNav: NavLink[] = [
  { href: '/jobs', label: 'Jobs' },
  { href: '/moves', label: 'Moves' },
  { href: '/articles', label: 'Stories' },
  { href: '/interviews', label: 'Interviews' },
  { href: '/data', label: 'Data' },
  { href: '/newsletter', label: 'Newsletter' },
];

export const employerNav: NavLink[] = [
  { href: '/employer', label: 'Overview' },
  { href: '/employer/mandates', label: 'Mandates' },
  { href: '/employer/jobs', label: 'Listings' },
  { href: '/employer/searches', label: 'Searches' },
  { href: '/employer/team', label: 'Team' },
  { href: '/employer/data', label: 'Data' },
  { href: '/employer/api', label: 'API' },
  { href: '/employer/billing', label: 'Billing' },
  { href: '/account', label: 'Account' },
];

export const candidateNav: NavLink[] = [
  { href: '/me', label: 'Overview' },
  { href: '/me/visibility', label: 'Visibility' },
  { href: '/me/matches', label: 'Matches' },
  { href: '/me/concierge', label: 'Concierge' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/account', label: 'Account' },
];

export const staffNav: NavLink[] = [
  { href: '/console', label: 'Overview' },
  { href: '/console/editorial', label: 'Editorial' },
  { href: '/console/listings', label: 'Listings' },
  { href: '/console/matches', label: 'Matches' },
  { href: '/console/searches', label: 'Searches' },
  { href: '/console/coaching', label: 'Coaching' },
  { href: '/console/agents', label: 'Agents' },
  { href: '/console/fairness', label: 'Fairness' },
  { href: '/console/sponsorships', label: 'Sponsorships' },
  { href: '/console/leads', label: 'Leads' },
];

export const readerNav: NavLink[] = [
  { href: '/account', label: 'Account' },
  { href: '/jobs', label: 'Jobs' },
];
