import type { Role } from '@cmobeat/config';

export type Area = 'public' | 'reader' | 'candidate' | 'employer' | 'staff';

/** Which roles may enter each private area. Checked in the proxy and again in each layout. */
export const areaAccess: Record<Exclude<Area, 'public'>, { prefix: string; roles: Role[] }> = {
  reader: {
    prefix: '/account',
    roles: ['reader', 'candidate', 'employer', 'editor', 'talent_partner', 'admin'],
  },
  candidate: { prefix: '/me', roles: ['candidate'] },
  employer: { prefix: '/employer', roles: ['employer'] },
  staff: { prefix: '/console', roles: ['editor', 'talent_partner', 'admin'] },
};

export function areaForPath(pathname: string): Exclude<Area, 'public'> | null {
  for (const [area, { prefix }] of Object.entries(areaAccess)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`))
      return area as Exclude<Area, 'public'>;
  }
  return null;
}

export const canEnter = (area: Exclude<Area, 'public'>, roles: readonly Role[]) =>
  areaAccess[area].roles.some((r) => roles.includes(r));
