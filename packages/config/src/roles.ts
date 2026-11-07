export const roles = [
  'reader',
  'candidate',
  'employer',
  'editor',
  'talent_partner',
  'admin',
] as const;
export type Role = (typeof roles)[number];

export const staffRoles: readonly Role[] = ['editor', 'talent_partner', 'admin'];
export const isStaff = (r: readonly Role[]) => r.some((x) => staffRoles.includes(x));

/** Where each role lands after sign-in. Highest-privilege area wins. */
export function homeFor(r: readonly Role[]): string {
  if (isStaff(r)) return '/console';
  if (r.includes('employer')) return '/employer';
  if (r.includes('candidate')) return '/me';
  return '/account';
}

/** Session lifetime in hours. Staff sessions are capped at 12 hours (spec 9.1). */
export const sessionHours = (r: readonly Role[]) => (isStaff(r) ? 12 : 24 * 7);
