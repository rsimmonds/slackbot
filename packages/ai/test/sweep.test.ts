import { adminDb, companies, moves, sourceItems, withUser } from '@cmobeat/db';
import { devUsers } from '@cmobeat/db/dev-users';
import { eq, inArray } from 'drizzle-orm';
import { fixtureAdapters, fixtureFetch } from '../src/moves/fixtures';
import { edgarAdapter, feedAdapter, parseFeed, type SourceAdapter } from '../src/moves/sources';
import { runMovesSweep } from '../src/moves/sweep';
import { submitTip, TIPS_PER_DAY } from '../src/moves/tips';
import { FakeProvider } from '../src/provider';
import { offlineFallbacks } from '../src/providers';

const provider = new FakeProvider(new Map(), offlineFallbacks);
const now = new Date('2026-11-07T12:00:00Z');

async function sweepRows() {
  const items = await adminDb().select().from(sourceItems);
  const ids = items.map((i) => i.moveId).filter((x): x is string => !!x);
  const drafted = ids.length
    ? await adminDb().select().from(moves).where(inArray(moves.id, ids))
    : [];
  return { items, drafted };
}

describe('source adapters', () => {
  it('parses RSS and Atom, and drops LinkedIn whatever the feed says', async () => {
    const wire = await feedAdapter({
      name: 'Wire',
      kind: 'wire',
      url: 'https://wire.example.com/feed.atom',
      fetchText: fixtureFetch,
    }).fetch(now);
    expect(wire.map((i) => i.url)).not.toContain('https://www.linkedin.com/pulse/modern-cmo');
    expect(wire).toHaveLength(3);
    expect(parseFeed('<rss><channel></channel></rss>', 'newsroom', null)).toEqual([]);
  });

  it('reads only Item 5.02 filings from EDGAR, with the SEC user agent', async () => {
    const seen: Record<string, string>[] = [];
    const items = await edgarAdapter({
      userAgent: 'CMO Beat test contact',
      delayMs: 0,
      fetchText: async (url, headers) => {
        seen.push(headers ?? {});
        return fixtureFetch(url);
      },
    }).fetch(now);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'edgar',
      title: 'BRIGHTWELL HEALTH INC: Form 8-K, Item 5.02',
    });
    expect(items[0]!.text).toMatch(/^Item 5\.02/);
    expect(items[0]!.text).not.toMatch(/Item 9\.01/);
    expect(seen.every((h) => h['user-agent'] === 'CMO Beat test contact')).toBe(true);
  });
});

describe('Moves Tracker sweep (offline fixtures)', () => {
  it('dedupes, classifies and drafts into the editorial queue, never publishing', async () => {
    const report = await runMovesSweep({ now, adapters: fixtureAdapters(), provider });
    expect(report.errors).toEqual([]);
    expect(report.duplicates).toBe(1); // the same release on the newsroom and the wire
    expect(report.drafted).toBe(3);
    expect(report.irrelevant).toBe(3); // results, a VP hire, a rumour

    const { items, drafted } = await sweepRows();
    expect(drafted.map((m) => m.personName).sort()).toEqual([
      'Dana Whitcombe',
      'Mara Ellison',
      'Teo Ravelli',
    ]);
    expect(drafted.every((m) => m.status === 'draft' && m.approvedBy === null)).toBe(true);

    for (const m of drafted) {
      const item = items.find((i) => i.moveId === m.id)!;
      // Sources or silence: exactly the item it came from.
      expect(m.sources.map((s) => s.url)).toEqual([item.url]);
      expect(m.agentRunId).not.toBeNull();
    }
    const mara = drafted.find((m) => m.personName === 'Mara Ellison')!;
    expect(mara).toMatchObject({
      moveType: 'appointed',
      title: 'Chief Marketing Officer',
      effectiveDate: '2026-12-01',
    });
    const dana = drafted.find((m) => m.personName === 'Dana Whitcombe')!;
    expect(dana).toMatchObject({ moveType: 'departed', effectiveDate: '2026-11-30' });
    const [danaCo] = await adminDb()
      .select()
      .from(companies)
      .where(eq(companies.id, dana.companyId));
    expect(danaCo!.name).toBe('BRIGHTWELL HEALTH INC');
    const danaItem = items.find((i) => i.moveId === dana.id)!;
    expect(danaItem.classification).toMatchObject({ flags: { companyCreated: true } });
    expect(items.filter((i) => i.status === 'irrelevant').map((i) => i.title)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Third Quarter/),
        expect.stringMatching(/VP, Product Marketing/),
        expect.stringMatching(/Could Be Leaving/),
      ]),
    );
  });

  it('never re-drafts on the next sweep', async () => {
    const before = (await adminDb().select().from(moves)).length;
    const report = await runMovesSweep({ now, adapters: fixtureAdapters(), provider });
    expect(report.inserted).toBe(0);
    expect(report.processed).toBe(0);
    expect((await adminDb().select().from(moves)).length).toBe(before);
  });

  it('keeps going when one source fails', async () => {
    const broken: SourceAdapter = {
      name: 'Broken',
      kind: 'wire',
      fetch: async () => {
        throw new Error('timeout');
      },
    };
    const report = await runMovesSweep({ now, adapters: [broken], provider });
    expect(report.errors).toEqual([{ source: 'Broken', message: 'timeout' }]);
  });
});

describe('reader tips', () => {
  const candidate = devUsers.find((u) => u.roles.includes('candidate'))!;
  const as = <T>(fn: Parameters<typeof withUser<T>>[1]) =>
    withUser({ userId: candidate.id, roles: candidate.roles }, fn);
  const tip = (n: number) => ({
    person: 'Ines Okafor',
    company: 'Northwind Robotics',
    role: 'Chief Growth Officer',
    move: 'promoted',
    url: `https://news.northwind.example/2026/ines-okafor-${n}`,
  });

  it('rejects LinkedIn and private addresses', async () => {
    expect(
      await as((tx) =>
        submitTip(tx, candidate.id, { ...tip(0), url: 'https://www.linkedin.com/in/someone' }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/LinkedIn/) });
    expect(
      await as((tx) =>
        submitTip(tx, candidate.id, { ...tip(0), url: 'http://169.254.169.254/latest' }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await as((tx) => submitTip(tx, candidate.id, { ...tip(0), url: 'not a link' })),
    ).toMatchObject({ ok: false });
  });

  it('stores a tip, and the next sweep drafts it as an unverified reader tip', async () => {
    expect(await as((tx) => submitTip(tx, candidate.id, tip(1)))).toMatchObject({ ok: true });
    expect(await as((tx) => submitTip(tx, candidate.id, tip(1)))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already have/),
    });
    const report = await runMovesSweep({ now, adapters: [], provider });
    expect(report.drafted).toBe(1);
    const [item] = await adminDb()
      .select()
      .from(sourceItems)
      .where(eq(sourceItems.url, tip(1).url));
    const [move] = await adminDb().select().from(moves).where(eq(moves.id, item!.moveId!));
    expect(move).toMatchObject({
      personName: 'Ines Okafor',
      moveType: 'promoted',
      status: 'draft',
    });
    expect(move!.confidence).toBeLessThanOrEqual(0.5);
    expect(move!.summary).toMatch(/not yet verified/);
    expect(item!.classification).toMatchObject({ flags: { readerTip: true } });
  });

  it(`limits tips to ${TIPS_PER_DAY} a day`, async () => {
    for (let n = 2; n <= TIPS_PER_DAY; n++)
      expect(await as((tx) => submitTip(tx, candidate.id, tip(n)))).toMatchObject({ ok: true });
    expect(await as((tx) => submitTip(tx, candidate.id, tip(99)))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/a day/),
    });
  });
});
