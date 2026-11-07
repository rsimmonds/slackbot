import type { Role } from '@cmobeat/config';

export interface DevUser {
  id: string;
  email: string;
  name: string;
  roles: readonly Role[];
  /** One-line description shown on the dev sign-in screen. */
  description: string;
}

/**
 * Fixed local accounts, one per role, for dev sign-in until Clerk is connected.
 * Stable ids so tests and bookmarks keep working across reseeds. Sample data only.
 */
export const devUsers: readonly DevUser[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'reader@sample.cmobeat.dev',
    name: 'Riley Reader',
    roles: ['reader'],
    description: 'Newsletter subscriber. Public pages and account settings.',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'candidate@sample.cmobeat.dev',
    name: 'Casey Candidate',
    roles: ['reader', 'candidate'],
    description: 'Sitting CMO. Private profile, hidden by default.',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'employer@sample.cmobeat.dev',
    name: 'Emerson Employer',
    roles: ['reader', 'employer'],
    description: 'CEO at a sample company. Posts roles, runs mandate sessions.',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    email: 'editor@sample.cmobeat.dev',
    name: 'Eden Editor',
    roles: ['reader', 'editor'],
    description: 'Reviews and approves every published item.',
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    email: 'talent@sample.cmobeat.dev',
    name: 'Tatum Talent',
    roles: ['reader', 'talent_partner'],
    description: 'Approves every match before an employer sees it.',
  },
  {
    id: '00000000-0000-4000-8000-000000000006',
    email: 'admin@sample.cmobeat.dev',
    name: 'Ari Admin',
    roles: ['reader', 'admin'],
    description: 'Users, companies, payments and agent monitoring.',
  },
];

export const devUserByEmail = (email: string) => devUsers.find((u) => u.email === email);
