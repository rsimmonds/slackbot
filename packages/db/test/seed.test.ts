import { afterAll, describe, expect, it } from 'vitest';
import { eq, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { adminDb, closeDb } from '../src/client';
import { decryptJson } from '../src/crypto';
import * as s from '../src/schema';
import { devUsers } from '../src/seed/dev-users';

afterAll(closeDb);

const count = async (table: PgTable, where?: SQL) => {
  const q = adminDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(table);
  const [row] = await (where ? q.where(where) : q);
  return row!.n;
};

describe('sample seed', () => {
  it('creates the counts the build spec asks for, all flagged as sample', async () => {
    expect(await count(s.companies, eq(s.companies.isSample, true))).toBe(40);
    expect(await count(s.candidateProfiles, eq(s.candidateProfiles.isSample, true))).toBe(60);
    expect(await count(s.listings, eq(s.listings.isSample, true))).toBe(30);
    expect(await count(s.articles, eq(s.articles.isSample, true))).toBe(12);
    expect(await count(s.moves, eq(s.moves.isSample, true))).toBeGreaterThanOrEqual(25);
  });

  it('covers all four markets and currencies', async () => {
    const markets = await adminDb().selectDistinct({ m: s.companies.market }).from(s.companies);
    expect(markets.map((r) => r.m).sort()).toEqual(['CA', 'EU', 'UK', 'US']);
    const currencies = await adminDb()
      .selectDistinct({ c: s.mandates.currency })
      .from(s.mandates)
      .where(eq(s.mandates.isSample, true));
    expect(currencies.map((r) => r.c).sort()).toEqual(['CAD', 'EUR', 'GBP', 'USD']);
  });

  it('creates one dev user per role with stable ids', async () => {
    for (const u of devUsers) {
      const [row] = await adminDb().select().from(s.users).where(eq(s.users.id, u.id));
      expect(row?.email).toBe(u.email);
    }
  });

  it('defaults most profiles to hidden and blocklists every current employer', async () => {
    const hidden = await count(
      s.candidateProfiles,
      sql`${s.candidateProfiles.visibility} = 'hidden' and ${s.candidateProfiles.isSample}`,
    );
    expect(hidden).toBeGreaterThan(30);
    const missing = await adminDb().execute(sql`
      select p.id from candidate_profiles p
      where p.is_sample and p.current_company_id is not null and not exists (
        select 1 from profile_blocklist b where b.profile_id = p.id and b.company_id = p.current_company_id)`);
    expect([...missing]).toHaveLength(0);
  });

  it('stores PII encrypted and bound to its row', async () => {
    const [p] = await adminDb()
      .select()
      .from(s.candidateProfiles)
      .where(eq(s.candidateProfiles.isSample, true))
      .limit(1);
    expect(p!.contact!.toString('utf8')).not.toContain('sample.cmobeat.dev');
    const contact = await decryptJson<{ email: string }>(p!.contact!, {
      aad: `candidate_profiles.contact:${p!.id}`,
    });
    expect(contact.email).toMatch(/@sample\.cmobeat\.dev$/);
  });

  it('gives every live listing a comp range', async () => {
    const bad = await adminDb().execute(sql`
      select l.id from listings l join mandates m on m.id = l.mandate_id
      where l.status = 'live' and (m.comp_min is null or m.comp_max is null)`);
    expect([...bad]).toHaveLength(0);
  });
});
