import 'server-only';
import { apiKeys, apiRequests, audit, companies, employerMembers } from '@cmobeat/db';
import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Viewer } from '@/lib/auth';
import { hasActiveEmployerSubscription } from '@/lib/billing/subscriptions';
import { asViewer } from '@/lib/db';
import { displayPrefix, generateKey, hashKey } from './crypto';
import { apiScopes } from './scopes';

/*
 * Key management for employers. Every read and write runs as the signed-in viewer, so the
 * database decides: only owners and admins of a company see or create its keys.
 */

export class KeyError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface ApiAccess {
  companyId: string;
  companyName: string;
  seatRole: 'owner' | 'admin' | 'member';
  isAdmin: boolean;
  subscribed: boolean;
}

/** The viewer's company, seat and whether it subscribes. Null if they hold no employer seat. */
export async function apiAccess(viewer: Viewer): Promise<ApiAccess | null> {
  if (!viewer.roles.includes('employer')) return null;
  const [m] = await asViewer(viewer, (tx) =>
    tx
      .select({
        companyId: employerMembers.companyId,
        seatRole: employerMembers.seatRole,
        companyName: companies.name,
      })
      .from(employerMembers)
      .innerJoin(companies, eq(companies.id, employerMembers.companyId))
      .where(eq(employerMembers.userId, viewer.id))
      .orderBy(asc(employerMembers.createdAt))
      .limit(1),
  );
  if (!m) return null;
  return {
    ...m,
    isAdmin: m.seatRole === 'owner' || m.seatRole === 'admin',
    subscribed: await hasActiveEmployerSubscription(m.companyId),
  };
}

async function requireKeyAdmin(viewer: Viewer | null): Promise<ApiAccess & { viewer: Viewer }> {
  if (!viewer) throw new KeyError('Sign in as an employer.', 401);
  const access = await apiAccess(viewer);
  if (!access) throw new KeyError('API keys are for employers.', 403);
  if (!access.isAdmin)
    throw new KeyError('Only your company’s owners and admins manage API keys.', 403);
  if (!access.subscribed)
    throw new KeyError('The data API is part of the employer subscription.', 403);
  return { ...access, viewer };
}

export const createKeyInput = z.object({
  name: z.string().trim().min(2).max(60),
  scopes: z.array(z.enum(apiScopes)).min(1),
});

/** Create a key. The full key is returned exactly once; only its peppered hash is stored. */
export async function createKey(viewer: Viewer | null, input: z.infer<typeof createKeyInput>) {
  const { companyId, viewer: v } = await requireKeyAdmin(viewer);
  const { name, scopes } = createKeyInput.parse(input);
  const key = generateKey();
  const prefix = displayPrefix(key);
  const row = await asViewer(v, async (tx) => {
    const [r] = await tx
      .insert(apiKeys)
      .values({
        companyId,
        name,
        prefix,
        scopes: [...new Set(scopes)],
        hashedKey: hashKey(key),
        createdBy: v.id,
      })
      .returning({ id: apiKeys.id });
    await audit(tx, {
      actorId: v.id,
      action: 'api_key.create',
      targetType: 'api_key',
      targetId: r!.id,
      metadata: { name, prefix, scopes },
    });
    return r!;
  });
  return { id: row.id, key, prefix, name, scopes };
}

export interface KeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export async function listKeys(viewer: Viewer): Promise<KeySummary[]> {
  return asViewer(viewer, (tx) =>
    tx
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        scopes: apiKeys.scopes,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .orderBy(sql`${apiKeys.revokedAt} is not null`, desc(apiKeys.createdAt)),
  );
}

/** Revoke a key. Immediate: the next request with it gets 401. Revoking twice is a no-op. */
export async function revokeKey(viewer: Viewer | null, id: string) {
  if (!viewer) throw new KeyError('Sign in as an employer.', 401);
  const access = await apiAccess(viewer);
  if (!access?.isAdmin)
    throw new KeyError('Only your company’s owners and admins manage API keys.', 403);
  return asViewer(viewer, async (tx) => {
    const [r] = await tx
      .update(apiKeys)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id, prefix: apiKeys.prefix });
    if (!r) {
      // Not found, someone else's key, or already revoked: indistinguishable on purpose.
      const [exists] = await tx.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.id, id));
      if (!exists) throw new KeyError('Key not found.', 404);
      return { id, alreadyRevoked: true };
    }
    await audit(tx, {
      actorId: viewer.id,
      action: 'api_key.revoke',
      targetType: 'api_key',
      targetId: r.id,
      metadata: { prefix: r.prefix },
    });
    return { id: r.id, alreadyRevoked: false };
  });
}

export interface UsageDay {
  day: string;
  requests: number;
  rows: number;
  errors: number;
}

/** Requests per day for the last 30 days, across the company's keys. */
export async function usageByDay(viewer: Viewer, now = new Date()): Promise<UsageDay[]> {
  const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const rows = await asViewer(viewer, (tx) =>
    tx
      .select({
        day: sql<string>`to_char(date_trunc('day', ${apiRequests.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        requests: sql<number>`count(*)::int`,
        rows: sql<number>`coalesce(sum(${apiRequests.rows}), 0)::int`,
        errors: sql<number>`count(*) filter (where ${apiRequests.status} >= 400)::int`,
      })
      .from(apiRequests)
      .where(gte(apiRequests.createdAt, since))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  );
  return rows.map((r) => ({
    ...r,
    requests: Number(r.requests),
    rows: Number(r.rows),
    errors: Number(r.errors),
  }));
}
