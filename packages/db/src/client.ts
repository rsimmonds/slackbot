import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { z } from 'zod';
import { roles as allRoles, type Role } from '@cmobeat/config';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

let adminClient: postgres.Sql | undefined;
let appClient: postgres.Sql | undefined;
let admin: Db | undefined;
let app: Db | undefined;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/**
 * Owner connection (bypasses RLS). For migrations, seed, background jobs and webhooks only.
 * Never use it to serve a user request.
 */
export function adminDb(): Db {
  if (!admin) {
    adminClient = postgres(requireEnv('DATABASE_URL'), { max: 5, onnotice: () => {} });
    admin = drizzle(adminClient, { schema });
  }
  return admin;
}

/** Restricted app connection (cmobeat_app → app_user). Only reachable through withUser/withAnon. */
function appDb(): Db {
  if (!app) {
    appClient = postgres(requireEnv('APP_DATABASE_URL'), { max: 10, onnotice: () => {} });
    app = drizzle(appClient, { schema });
  }
  return app;
}

export interface UserContext {
  userId: string;
  roles: readonly Role[];
}

const ctxSchema = z.object({
  userId: z.string().uuid(),
  roles: z.array(z.enum(allRoles)),
});

/**
 * Runs `fn` in a transaction as the given user. RLS policies read app.user_id and app.roles;
 * roles also have to exist in user_roles to count, so a wrong `roles` list cannot escalate.
 */
export async function withUser<T>(ctx: UserContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const { userId, roles } = ctxSchema.parse({ userId: ctx.userId, roles: [...ctx.roles] });
  return appDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', ${userId}, true), set_config('app.roles', ${roles.join(',')}, true)`,
    );
    return fn(tx);
  });
}

/** Runs `fn` as an anonymous visitor: public content only. */
export async function withAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return appDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', '', true), set_config('app.roles', '', true)`,
    );
    return fn(tx);
  });
}

export async function closeDb(): Promise<void> {
  await Promise.all([adminClient?.end({ timeout: 5 }), appClient?.end({ timeout: 5 })]);
  adminClient = appClient = undefined;
  admin = app = undefined;
}
