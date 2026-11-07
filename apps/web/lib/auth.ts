import 'server-only';
import { homeFor, isStaff, sessionHours, type Role } from '@cmobeat/config';
import { serverEnv } from '@cmobeat/config/env';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { areaAccess, canEnter, type Area } from './areas';
import { SESSION_COOKIE, signSession, verifySession } from './session-token';
import { findUserByAuthProviderId, findUserById, type UserRecord } from './users';

export type Viewer = UserRecord;

/**
 * Two auth modes behind one interface.
 * - clerk: production. Magic links, Google, Microsoft, MFA (configured in Clerk).
 * - dev:   local-only sign-in as a seeded sample user, until Clerk keys exist. Refused in production.
 */
export const authMode = () => serverEnv().AUTH_MODE;

export async function getViewer(): Promise<Viewer | null> {
  const env = serverEnv();
  if (env.AUTH_MODE === 'clerk') {
    const { auth } = await import('@clerk/nextjs/server');
    const session = await auth();
    if (!session.userId) return null;
    const user = await findUserByAuthProviderId(session.userId);
    if (!user) return null;
    // Staff and employer admins must have passed a second factor this session (spec 9.1).
    const secondFactorAge = session.factorVerificationAge?.[1] ?? -1;
    if (isStaff(user.roles) && secondFactorAge < 0) {
      return {
        ...user,
        roles: user.roles.filter((r) => r === 'reader' || r === 'candidate' || r === 'employer'),
      };
    }
    return user;
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await verifySession(token, env.DEV_AUTH_SECRET!);
  if (!payload) return null;
  // Roles come from the database on every request so revocation takes effect immediately.
  return findUserById(payload.uid);
}

/** Server-side gate for each private area. The proxy checks first; this is the second wall. */
export async function requireArea(area: Exclude<Area, 'public'>): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(areaAccess[area].prefix)}`);
  if (!canEnter(area, viewer.roles)) redirect(homeFor(viewer.roles));
  return viewer;
}

/** Dev sign-in: issue a signed cookie. Lifetime is 12h for staff, 7 days otherwise. */
export async function startDevSession(user: { id: string; roles: Role[] }) {
  const env = serverEnv();
  if (env.AUTH_MODE !== 'dev') throw new Error('Dev sign-in is disabled');
  const hours = sessionHours(user.roles);
  const exp = Math.floor(Date.now() / 1000) + hours * 3600;
  const token = await signSession({ uid: user.id, roles: user.roles, exp }, env.DEV_AUTH_SECRET!);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: hours * 3600,
  });
}

export async function endDevSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
