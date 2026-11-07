import {
  adminDb,
  apiKeys,
  apiRequests,
  auditLog,
  candidateProfiles,
  companies,
  employerMembers,
  moves,
  subscriptions,
  userRoles,
  users,
} from '@cmobeat/db';
import { devUsers } from '@cmobeat/db/dev-users';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { GET as companiesRoute } from '@/app/api/v1/companies/route';
import { GET as compRoute } from '@/app/api/v1/comp/route';
import { GET as listingsRoute } from '@/app/api/v1/listings/route';
import { GET as moveRoute } from '@/app/api/v1/moves/[id]/route';
import { GET as movesRoute } from '@/app/api/v1/moves/route';
import { GET as openapiRoute } from '@/app/api/v1/openapi.json/route';
import { GET as exportRoute } from '@/app/employer/data/export/route';
import { hashKey, KEY_PATTERN } from '@/lib/api-keys/crypto';
import { createKey, KeyError, listKeys, revokeKey, usageByDay } from '@/lib/api-keys/keys';
import type { Viewer } from '@/lib/auth';
import { csvField } from '@/lib/intelligence/export';
import { openApiDocument, schemas } from '@/lib/intelligence/openapi';
import { testAuth } from './setup';

// ------------------------------------------------------------------ helpers

const devEmployer = devUsers.find((u) => u.email === 'employer@sample.cmobeat.dev')!;
const employer: Viewer = {
  id: devEmployer.id,
  email: devEmployer.email,
  name: devEmployer.name,
  roles: [...devEmployer.roles],
};

async function companyOf(userId: string) {
  const [m] = await adminDb()
    .select({ companyId: employerMembers.companyId })
    .from(employerMembers)
    .where(eq(employerMembers.userId, userId));
  return m!.companyId;
}

async function setSubscription(companyId: string, status: string | null) {
  await adminDb().delete(subscriptions).where(eq(subscriptions.companyId, companyId));
  if (!status) return;
  await adminDb()
    .insert(subscriptions)
    .values({
      companyId,
      stripeCustomerId: 'cus_test',
      stripeSubscriptionId: `sub_test_${crypto.randomUUID()}`,
      product: 'employer_subscription',
      stripePriceId: 'price_test',
      status,
      seats: 3,
    });
}

/** A new employer user with a seat on a company (a fresh one unless given). */
async function makeEmployer(
  seatRole: 'owner' | 'admin' | 'member',
  companyId?: string,
): Promise<Viewer> {
  const db = adminDb();
  const email = `api-${seatRole}-${crypto.randomUUID().slice(0, 8)}@sample.cmobeat.dev`;
  const [u] = await db
    .insert(users)
    .values({ email, displayName: `API ${seatRole}`, isSample: true })
    .returning({ id: users.id });
  await db.insert(userRoles).values([
    { userId: u!.id, role: 'reader' },
    { userId: u!.id, role: 'employer' },
  ]);
  let company = companyId;
  if (!company) {
    const [c] = await db
      .insert(companies)
      .values({
        name: `API Test Co ${email.slice(4, 12)}`,
        industry: 'Software',
        stage: 'Series B',
        sizeBand: '201-500',
        hqCountry: 'US',
        market: 'US',
        isSample: true,
      })
      .returning({ id: companies.id });
    company = c!.id;
  }
  await db.insert(employerMembers).values({ userId: u!.id, companyId: company, seatRole });
  return { id: u!.id, email, name: `API ${seatRole}`, roles: ['reader', 'employer'] };
}

const get = (path: string, key?: string) =>
  new Request(`http://localhost:3000${path}`, {
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });
const json = async (res: Response) =>
  (await res.json()) as Record<string, unknown> & {
    data: unknown;
    next_cursor: string | null;
    meta: Record<string, unknown>;
    error: { code: string; message: string };
  };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Tiny JSON Schema check (the subset the OpenAPI document uses): types, required, enums, no extras. */
function validate(schema: Record<string, unknown>, value: unknown, path = '$'): string[] {
  const s = schema as {
    type?: string | string[];
    required?: string[];
    properties?: Record<string, Record<string, unknown>>;
    additionalProperties?: boolean;
    enum?: unknown[];
    items?: Record<string, unknown>;
  };
  const errs: string[] = [];
  const types = s.type ? (Array.isArray(s.type) ? s.type : [s.type]) : [];
  const actual =
    value === null
      ? 'null'
      : Array.isArray(value)
        ? 'array'
        : Number.isInteger(value)
          ? 'integer'
          : typeof value;
  if (
    types.length &&
    !types.includes(actual) &&
    !(actual === 'integer' && types.includes('number'))
  )
    errs.push(`${path}: expected ${types.join('|')}, got ${actual}`);
  if (s.enum && !s.enum.includes(value)) errs.push(`${path}: ${String(value)} not in enum`);
  if (actual === 'object' && s.properties) {
    const obj = value as Record<string, unknown>;
    for (const r of s.required ?? []) if (!(r in obj)) errs.push(`${path}.${r}: missing`);
    for (const [k, v] of Object.entries(obj)) {
      if (s.properties[k]) errs.push(...validate(s.properties[k], v, `${path}.${k}`));
      else if (s.additionalProperties === false) errs.push(`${path}.${k}: not in schema`);
    }
  }
  if (actual === 'array' && s.items)
    (value as unknown[]).forEach((v, i) => errs.push(...validate(s.items!, v, `${path}[${i}]`)));
  return errs;
}

let companyId: string;
let key: string;

beforeAll(async () => {
  companyId = await companyOf(employer.id);
  await adminDb().delete(apiKeys).where(eq(apiKeys.companyId, companyId));
  await setSubscription(companyId, 'active');
  testAuth.viewer = employer;
  key = (
    await createKey(employer, {
      name: 'Test suite',
      scopes: ['moves:read', 'listings:read', 'comp:read'],
    })
  ).key;
});

afterEach(() => {
  delete process.env.API_RATE_PER_MINUTE;
});

// ------------------------------------------------------------------ keys

describe('API keys', () => {
  it('are created only by owners and admins of a subscribing company', async () => {
    const member = await makeEmployer('member', companyId);
    await expect(createKey(member, { name: 'Nope', scopes: ['moves:read'] })).rejects.toMatchObject(
      {
        status: 403,
      },
    );
    const lonely = await makeEmployer('owner');
    await expect(createKey(lonely, { name: 'No sub', scopes: ['moves:read'] })).rejects.toThrow(
      /subscription/,
    );
    await expect(createKey(null, { name: 'Anon', scopes: ['moves:read'] })).rejects.toBeInstanceOf(
      KeyError,
    );
  });

  it('are shown once, stored only as a peppered hash with a display prefix, and audit-logged', async () => {
    const k = await createKey(employer, { name: 'Board dashboard', scopes: ['moves:read'] });
    expect(k.key).toMatch(KEY_PATTERN);
    const [row] = await adminDb().select().from(apiKeys).where(eq(apiKeys.id, k.id));
    expect(row!.hashedKey).toBe(hashKey(k.key));
    expect(row!.hashedKey).not.toContain(k.key.slice(10));
    expect(row!.prefix).toBe(k.key.slice(0, 12));
    expect(JSON.stringify(row)).not.toContain(k.key);
    const [a] = await adminDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'api_key.create'), eq(auditLog.targetId, k.id)));
    expect(JSON.stringify(a!.metadata)).not.toContain(k.key);
  });

  it('another company’s admin can neither list nor revoke them', async () => {
    const k = await createKey(employer, { name: 'Private', scopes: ['moves:read'] });
    const other = await makeEmployer('owner');
    expect((await listKeys(other)).map((x) => x.id)).not.toContain(k.id);
    await expect(revokeKey(other, k.id)).rejects.toMatchObject({ status: 404 });
    expect((await listKeys(employer)).map((x) => x.id)).toContain(k.id);
  });
});

// ------------------------------------------------------------------ auth

describe('authentication', () => {
  it('rejects missing, malformed, unknown and revoked keys with clear codes', async () => {
    const missing = await moviesOf(await movesRoute(get('/api/v1/moves')));
    expect(missing).toEqual([401, 'missing_key']);
    expect(await moviesOf(await movesRoute(get('/api/v1/moves', 'not-a-key')))).toEqual([
      401,
      'invalid_key',
    ]);
    expect(
      await moviesOf(await movesRoute(get('/api/v1/moves', `cmob_live_${'A'.repeat(32)}`))),
    ).toEqual([401, 'invalid_key']);

    const k = await createKey(employer, { name: 'To revoke', scopes: ['moves:read'] });
    expect((await movesRoute(get('/api/v1/moves', k.key))).status).toBe(200);
    await revokeKey(employer, k.id);
    expect(await moviesOf(await movesRoute(get('/api/v1/moves', k.key)))).toEqual([
      401,
      'revoked_key',
    ]);
    const [a] = await adminDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'api_key.revoke'), eq(auditLog.targetId, k.id)));
    expect(a).toBeTruthy();
  });

  it('stops working when the subscription lapses, and needs the right scope', async () => {
    await setSubscription(companyId, 'canceled');
    expect(await moviesOf(await movesRoute(get('/api/v1/moves', key)))).toEqual([
      403,
      'subscription_inactive',
    ]);
    await setSubscription(companyId, 'active');
    const narrow = await createKey(employer, { name: 'Moves only', scopes: ['moves:read'] });
    expect(await moviesOf(await compRoute(get('/api/v1/comp', narrow.key)))).toEqual([
      403,
      'insufficient_scope',
    ]);
    expect(await moviesOf(await listingsRoute(get('/api/v1/listings', narrow.key)))).toEqual([
      403,
      'insufficient_scope',
    ]);
  });

  it('rate-limits per key with headers and Retry-After, and logs only path, status and rows', async () => {
    const k = await createKey(employer, { name: 'Limited', scopes: ['moves:read'] });
    process.env.API_RATE_PER_MINUTE = '3';
    for (let i = 0; i < 3; i++) {
      const res = await movesRoute(get('/api/v1/moves?limit=2&market=US', k.key));
      expect(res.status).toBe(200);
      expect(res.headers.get('x-ratelimit-limit')).toBe('3');
    }
    const limited = await movesRoute(get('/api/v1/moves', k.key));
    expect(limited.status).toBe(429);
    expect((await json(limited)).error.code).toBe('rate_limited');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);

    const logged = await adminDb().select().from(apiRequests).where(eq(apiRequests.apiKeyId, k.id));
    expect(logged.map((r) => r.path)).toEqual(Array(4).fill('/api/v1/moves'));
    expect(logged.filter((r) => r.status === 200).every((r) => r.rows === 2)).toBe(true);
    const [row] = await adminDb().select().from(apiKeys).where(eq(apiKeys.id, k.id));
    expect(row!.lastUsedAt).toBeInstanceOf(Date);
    const usage = await usageByDay(employer);
    expect(usage.reduce((n, u) => n + u.requests, 0)).toBeGreaterThanOrEqual(4);
  });
});

async function moviesOf(res: Response): Promise<[number, string]> {
  return [res.status, (await json(res)).error?.code];
}

// ------------------------------------------------------------------ data

describe('GET /api/v1/moves', () => {
  it('returns approved moves in the documented shape, newest first', async () => {
    const res = await movesRoute(get('/api/v1/moves?limit=200', key));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('private');
    const body = await json(res);
    const data = body.data as { id: string; effectiveDate: string }[];
    expect(data.length).toBeGreaterThan(0);
    expect(validate(schemas.Move as never, data[0])).toEqual([]);
    for (const m of data) expect(validate(schemas.Move as never, m)).toEqual([]);
    const sorted = [...data].sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
    expect(data.map((m) => m.effectiveDate)).toEqual(sorted.map((m) => m.effectiveDate));
    expect(body.meta).toMatchObject({ count: data.length });

    // Drafts and rejected moves are never served.
    const unpublished = await adminDb()
      .select({ id: moves.id })
      .from(moves)
      .where(ne(moves.status, 'approved'));
    expect(unpublished.length).toBeGreaterThan(0);
    const ids = new Set(data.map((m) => m.id));
    for (const u of unpublished) expect(ids.has(u.id)).toBe(false);
    for (const u of unpublished)
      expect((await moveRoute(get(`/api/v1/moves/${u.id}`, key), ctx(u.id))).status).toBe(404);
  });

  it('paginates with an opaque cursor without gaps or repeats, and rejects tampered cursors', async () => {
    const all = (await json(await movesRoute(get('/api/v1/moves?limit=200', key)))).data as {
      id: string;
    }[];
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const body = await json(
        await movesRoute(get(`/api/v1/moves?limit=4${cursor ? `&cursor=${cursor}` : ''}`, key)),
      );
      seen.push(...(body.data as { id: string }[]).map((m) => m.id));
      cursor = body.next_cursor;
    } while (cursor);
    expect(seen).toEqual(all.map((m) => m.id));
    const bad = await movesRoute(get('/api/v1/moves?cursor=bm9wZQ', key));
    expect(bad.status).toBe(400);
    expect((await json(bad)).error.code).toBe('invalid_request');
    expect((await movesRoute(get('/api/v1/moves?limit=999', key))).status).toBe(400);
  });

  it('filters by type, market and date', async () => {
    const body = await json(
      await movesRoute(get('/api/v1/moves?type=departed&market=US&from=2020-01-01&limit=200', key)),
    );
    const data = body.data as {
      type: string;
      company: { market: string };
      effectiveDate: string;
    }[];
    expect(data.every((m) => m.type === 'departed' && m.company.market === 'US')).toBe(true);
    const one = (await json(await movesRoute(get('/api/v1/moves?limit=1', key)))).data as {
      id: string;
    }[];
    const single = await json(
      await moveRoute(get(`/api/v1/moves/${one[0]!.id}`, key), ctx(one[0]!.id)),
    );
    expect((single.data as { id: string }).id).toBe(one[0]!.id);
  });
});

describe('listings, comp and companies', () => {
  it('serves live listings only, with comp and no internal fields', async () => {
    const body = await json(await listingsRoute(get('/api/v1/listings?limit=200', key)));
    const data = body.data as Record<string, unknown>[];
    expect(data.length).toBeGreaterThan(0);
    for (const l of data) expect(validate(schemas.Listing as never, l)).toEqual([]);
    const text = JSON.stringify(data);
    for (const internal of ['paidAt', 'checkoutRef', 'moderationNote', 'rawSource', 'companyId'])
      expect(text).not.toContain(internal);
  });

  it('aggregates comp per currency and basis, and suppresses thin cells', async () => {
    const body = await json(await compRoute(get('/api/v1/comp', key)));
    const cells = body.data as {
      n: number;
      suppressed: boolean;
      p25: number | null;
      median: number | null;
      p75: number | null;
    }[];
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(validate(schemas.CompCell as never, c)).toEqual([]);
      if (c.n < 5) expect([c.suppressed, c.p25, c.median, c.p75]).toEqual([true, null, null, null]);
      else {
        expect(c.suppressed).toBe(false);
        expect(c.p25!).toBeLessThanOrEqual(c.median!);
        expect(c.median!).toBeLessThanOrEqual(c.p75!);
      }
    }
  });

  it('lists companies’ public fields alphabetically with a cursor', async () => {
    const first = await json(await companiesRoute(get('/api/v1/companies?limit=5', key)));
    const data = first.data as { name: string }[];
    expect(data).toHaveLength(5);
    for (const c of data) expect(validate(schemas.Company as never, c)).toEqual([]);
    const next = await json(
      await companiesRoute(get(`/api/v1/companies?limit=5&cursor=${first.next_cursor}`, key)),
    );
    expect((next.data as { name: string }[])[0]!.name >= data[4]!.name).toBe(true);
  });
});

describe('no private data, ever', () => {
  it('never returns candidate names, emails or profile text from any endpoint', async () => {
    const candidateRows = await adminDb()
      .select({ email: users.email, name: users.displayName, headline: candidateProfiles.headline })
      .from(candidateProfiles)
      .innerJoin(users, eq(users.id, candidateProfiles.userId));
    expect(candidateRows.length).toBeGreaterThan(10);
    const bodies = await Promise.all([
      movesRoute(get('/api/v1/moves?limit=200', key)).then((r) => r.text()),
      listingsRoute(get('/api/v1/listings?limit=200', key)).then((r) => r.text()),
      compRoute(get('/api/v1/comp', key)).then((r) => r.text()),
      companiesRoute(get('/api/v1/companies?limit=200', key)).then((r) => r.text()),
    ]);
    const all = bodies.join('\n');
    for (const c of candidateRows) {
      expect(all).not.toContain(c.email);
      if (c.headline) expect(all).not.toContain(c.headline);
    }
    for (const word of ['visibility', 'outcome', 'candidate', 'match', 'profile', 'hashedKey'])
      expect(all.toLowerCase()).not.toContain(word.toLowerCase());
  });
});

// ------------------------------------------------------------------ OpenAPI

describe('OpenAPI', () => {
  it('describes every endpoint, and the route serves it', async () => {
    const doc = await (await openapiRoute()).json();
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths).sort()).toEqual(
      ['/comp', '/companies', '/listings', '/moves', '/moves/{id}'].sort(),
    );
    expect(doc).toEqual(JSON.parse(JSON.stringify(openApiDocument())));
    expect(doc.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });
});

// ------------------------------------------------------------------ exports

describe('intelligence exports', () => {
  it('stream the moves dataset as CSV with a provenance line, and are audit-logged', async () => {
    testAuth.viewer = employer;
    const res = await exportRoute(
      new Request('http://localhost:3000/employer/data/export?dataset=moves&format=csv'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="cmobeat-moves-/);
    const text = await res.text();
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toMatch(
      /^# CMO Beat moves dataset · generated .* · filters: none · CMO Beat data licence/,
    );
    expect(lines[1]).toBe(
      'id,person,company,industry,market,type,title,previous_role,effective_date,source_urls,url',
    );
    const approved = await adminDb()
      .select({ id: moves.id })
      .from(moves)
      .where(eq(moves.status, 'approved'));
    expect(lines.length - 2).toBe(approved.length);
    const [a] = await adminDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'intelligence.export'), eq(auditLog.actorId, employer.id)));
    expect(a!.metadata).toMatchObject({ dataset: 'moves', format: 'csv' });
  });

  it('exports comp as JSON, and refuses non-subscribers and non-employers', async () => {
    const res = await exportRoute(
      new Request('http://localhost:3000/employer/data/export?dataset=comp&format=json'),
    );
    const body = JSON.parse(await res.text());
    expect(body.provenance).toMatch(/comp dataset/);
    expect(Array.isArray(body.data)).toBe(true);

    testAuth.viewer = await makeEmployer('owner');
    expect(
      (await exportRoute(new Request('http://localhost:3000/employer/data/export?dataset=moves')))
        .status,
    ).toBe(403);
    testAuth.viewer = null;
    expect(
      (await exportRoute(new Request('http://localhost:3000/employer/data/export?dataset=moves')))
        .status,
    ).toBe(401);
    testAuth.viewer = employer;
    expect(
      (await exportRoute(new Request('http://localhost:3000/employer/data/export?dataset=nope')))
        .status,
    ).toBe(400);
  });

  it('neutralises spreadsheet formulas and quotes CSV fields', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('+1 555')).toBe("'+1 555");
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField(null)).toBe('');
  });
});

// Keep the shared test database tidy for other suites.
afterAll(async () => {
  const keys = await adminDb()
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(eq(apiKeys.companyId, companyId));
  if (keys.length)
    await adminDb()
      .delete(apiKeys)
      .where(
        inArray(
          apiKeys.id,
          keys.map((k) => k.id),
        ),
      );
  await setSubscription(companyId, null);
});
