import 'server-only';
import { adminDb, apiKeys, apiRequests } from '@cmobeat/db';
import { and, eq, gte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { hasActiveEmployerSubscription } from '@/lib/billing/subscriptions';
import { InvalidCursorError, licence } from '@/lib/intelligence/filters';
import { hashKey, KEY_PATTERN, sameHash } from './crypto';
import { rateLimits, type ApiScope } from './scopes';

/*
 * The data API authenticates by key, not by session. Resolving a key is the only system read
 * (a hash lookup on api_keys); the data itself is served through withAnon in lib/intelligence,
 * so row-level security still limits responses to public data.
 */

export type ApiErrorCode =
  | 'missing_key'
  | 'invalid_key'
  | 'revoked_key'
  | 'subscription_inactive'
  | 'insufficient_scope'
  | 'rate_limited'
  | 'invalid_request'
  | 'not_found';

const statusFor: Record<ApiErrorCode, number> = {
  missing_key: 401,
  invalid_key: 401,
  revoked_key: 401,
  subscription_inactive: 403,
  insufficient_scope: 403,
  rate_limited: 429,
  invalid_request: 400,
  not_found: 404,
};

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
  get status() {
    return statusFor[this.code];
  }
}

interface ResolvedKey {
  id: string;
  companyId: string;
  scopes: string[];
}

async function resolveKey(req: Request): Promise<ResolvedKey> {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new ApiError('missing_key', 'Send your key as "Authorization: Bearer <key>".');
  const key = match[1]!;
  if (!KEY_PATTERN.test(key))
    throw new ApiError('invalid_key', 'That is not a valid CMO Beat key.');
  const hashed = hashKey(key);
  const [row] = await adminDb()
    .select({
      id: apiKeys.id,
      companyId: apiKeys.companyId,
      scopes: apiKeys.scopes,
      hashedKey: apiKeys.hashedKey,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.hashedKey, hashed))
    .limit(1);
  if (!row || !sameHash(row.hashedKey, hashed))
    throw new ApiError('invalid_key', 'That is not a valid CMO Beat key.');
  if (row.revokedAt) throw new ApiError('revoked_key', 'This key has been revoked.');
  return { id: row.id, companyId: row.companyId, scopes: row.scopes };
}

async function enforceRateLimit(keyId: string, now: Date): Promise<Record<string, string>> {
  const { perMinute, perDay } = rateLimits();
  const minuteAgo = new Date(now.getTime() - 60_000);
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [c] = await adminDb()
    .select({
      minute: sql<number>`count(*) filter (where ${apiRequests.createdAt} >= ${minuteAgo.toISOString()}::timestamptz)::int`,
      day: sql<number>`count(*)::int`,
    })
    .from(apiRequests)
    .where(and(eq(apiRequests.apiKeyId, keyId), gte(apiRequests.createdAt, dayStart)));
  const minute = Number(c?.minute ?? 0);
  const day = Number(c?.day ?? 0);
  const resetDay = Math.floor(dayStart.getTime() / 1000) + 86_400;
  const headers = {
    'X-RateLimit-Limit': String(perMinute),
    'X-RateLimit-Remaining': String(Math.max(0, perMinute - minute - 1)),
    'X-RateLimit-Reset': String(Math.ceil((now.getTime() + 60_000) / 1000)),
    'X-RateLimit-Limit-Day': String(perDay),
    'X-RateLimit-Remaining-Day': String(Math.max(0, perDay - day - 1)),
    'X-RateLimit-Reset-Day': String(resetDay),
  };
  if (minute >= perMinute)
    throw new ApiError('rate_limited', `Limit of ${perMinute} requests per minute reached.`, {
      ...headers,
      'X-RateLimit-Remaining': '0',
      'Retry-After': '60',
    });
  if (day >= perDay)
    throw new ApiError('rate_limited', `Limit of ${perDay} requests per day reached.`, {
      ...headers,
      'X-RateLimit-Remaining-Day': '0',
      'Retry-After': String(Math.max(1, resetDay - Math.floor(now.getTime() / 1000))),
    });
  return headers;
}

/** Log path, status and row count only. Never query strings with personal data, never bodies. */
async function logRequest(keyId: string, path: string, status: number, rows: number) {
  await adminDb().insert(apiRequests).values({ apiKeyId: keyId, path, status, rows });
  if (status < 400)
    await adminDb().update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyId));
}

export interface ApiResult {
  data: unknown;
  nextCursor?: string | null;
  rows: number;
}

const baseHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

function errorResponse(e: ApiError) {
  return NextResponse.json(
    { error: { code: e.code, message: e.message } },
    { status: e.status, headers: { ...baseHeaders, ...e.headers } },
  );
}

/**
 * Wrap a v1 endpoint: authenticate, check subscription and scope, rate-limit, run, log.
 * Responses use one envelope: { data, next_cursor, meta } or { error: { code, message } }.
 */
export async function v1(
  req: Request,
  scope: ApiScope,
  handler: (url: URL) => Promise<ApiResult>,
): Promise<Response> {
  const url = new URL(req.url);
  const now = new Date();
  let key: ResolvedKey;
  try {
    key = await resolveKey(req);
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    throw e;
  }
  let limitHeaders: Record<string, string> = {};
  try {
    limitHeaders = await enforceRateLimit(key.id, now);
    if (!(await hasActiveEmployerSubscription(key.companyId)))
      throw new ApiError(
        'subscription_inactive',
        'Your company’s employer subscription is not active. Keys work again once it is.',
      );
    if (!key.scopes.includes(scope))
      throw new ApiError('insufficient_scope', `This key does not have the "${scope}" scope.`);
    const result = await handler(url);
    await logRequest(key.id, url.pathname, 200, result.rows);
    return NextResponse.json(
      {
        data: result.data,
        next_cursor: result.nextCursor ?? null,
        meta: { generated_at: now.toISOString(), count: result.rows, licence },
      },
      { headers: { ...baseHeaders, ...limitHeaders } },
    );
  } catch (e) {
    const err =
      e instanceof ApiError
        ? e
        : e instanceof ZodError
          ? new ApiError(
              'invalid_request',
              e.issues.map((i) => `${i.path.join('.') || 'query'}: ${i.message}`).join('; '),
            )
          : e instanceof InvalidCursorError
            ? new ApiError('invalid_request', e.message)
            : null;
    if (!err) {
      await logRequest(key.id, url.pathname, 500, 0);
      throw e;
    }
    await logRequest(key.id, url.pathname, err.status, 0);
    return errorResponse(
      err.code === 'rate_limited'
        ? err
        : new ApiError(err.code, err.message, { ...limitHeaders, ...err.headers }),
    );
  }
}
