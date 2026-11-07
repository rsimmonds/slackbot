import 'server-only';
import { roles as allRoles, type Role } from '@cmobeat/config';
import { adminDb, companies, employerMembers, userRoles, users, withUser } from '@cmobeat/db';
import { devUsers } from '@cmobeat/db/dev-users';
import { and, eq, isNull } from 'drizzle-orm';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  roles: Role[];
}

/**
 * Identity resolution happens before a user context exists, so it uses the owner connection,
 * like an auth webhook would. It reads only users and user_roles. Everything after sign-in
 * goes through withUser and row-level security.
 */
async function findUser(where: ReturnType<typeof eq>): Promise<UserRecord | null> {
  const rows = await adminDb()
    .select({ id: users.id, email: users.email, name: users.displayName, role: userRoles.role })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(where, isNull(users.deletedAt)));
  const first = rows[0];
  if (!first) return null;
  const roles = rows.map((r) => r.role).filter((r): r is Role => !!r && allRoles.includes(r));
  return {
    id: first.id,
    email: first.email,
    name: first.name,
    roles: roles.length ? roles : ['reader'],
  };
}

export const findUserById = (id: string) => findUser(eq(users.id, id));
export const findUserByEmail = (email: string) => findUser(eq(users.email, email.toLowerCase()));
export const findUserByAuthProviderId = (authId: string) =>
  findUser(eq(users.authProviderId, authId));

/** Dev sign-in choices: the fixed sample users, one per role. */
export async function listDevUsers() {
  return devUsers.map((u) => ({
    email: u.email,
    name: u.name,
    roles: [...u.roles],
    description: u.description,
  }));
}

export async function companyForEmployer(userId: string): Promise<string | null> {
  const viewer = await findUserById(userId);
  if (!viewer) return null;
  return withUser({ userId, roles: viewer.roles }, async (tx) => {
    const [row] = await tx
      .select({ name: companies.name })
      .from(employerMembers)
      .innerJoin(companies, eq(companies.id, employerMembers.companyId))
      .where(eq(employerMembers.userId, userId))
      .limit(1);
    return row?.name ?? null;
  });
}
