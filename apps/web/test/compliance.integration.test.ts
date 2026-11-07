import { adminDb, agentRuns, auditLog, humanQueue, sponsorships, withUser } from '@cmobeat/db';
import { activeSponsorship } from '@cmobeat/email';
import { and, eq, inArray, like } from 'drizzle-orm';
import {
  costByDay,
  listRuns,
  openQueue,
  resolveQueueItem,
  summaryByAgent,
} from '@/lib/agents/monitoring';
import {
  activeForPlacement,
  createSponsorship,
  endSponsorship,
  isoDay,
  listSponsorships,
  updateSponsorship,
} from '@/lib/sponsorships';
import type { Viewer } from '@/lib/auth';
import { signInAs } from './helpers';

const viewerFor = (who: Parameters<typeof signInAs>[0]) => signInAs(who) as unknown as Viewer;

const DAY = 86_400_000;
const day = (offset: number) => isoDay(new Date(Date.now() + offset * DAY));
const TAG = 'Compliance test sponsor';

const booking = (over: Record<string, unknown> = {}) => ({
  sponsorName: `${TAG} A`,
  placement: 'home',
  creative: {
    headline: 'Benchmark your team',
    body: 'A report for CMOs.',
    url: 'https://sponsor.example/report',
  },
  startDate: day(-1),
  endDate: day(5),
  amount: 500_000,
  currency: 'USD',
  ...over,
});

afterAll(async () => {
  await adminDb()
    .delete(sponsorships)
    .where(like(sponsorships.sponsorName, `${TAG}%`));
});

describe('sponsorships', () => {
  beforeEach(async () => {
    await adminDb()
      .delete(sponsorships)
      .where(like(sponsorships.sponsorName, `${TAG}%`));
  });

  it('an admin books one, it shows on its placement only within its dates, and it is audited', async () => {
    const admin = viewerFor('admin');
    const { id, overlaps } = await createSponsorship(admin, booking());
    expect(overlaps).toEqual([]);
    expect((await activeForPlacement('home'))?.id).toBe(id);
    expect(await activeForPlacement('jobs_index')).toBeNull();
    expect(await activeForPlacement('home', day(6))).toBeNull();
    expect(await activeForPlacement('home', day(-2))).toBeNull();

    const [entry] = await adminDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, id), eq(auditLog.action, 'sponsorship.create')));
    expect(entry?.actorId).toBe(admin.id);
  });

  it('warns about overlapping bookings on the same placement but still saves', async () => {
    const admin = viewerFor('admin');
    await createSponsorship(admin, booking());
    const second = await createSponsorship(
      admin,
      booking({ sponsorName: `${TAG} B`, startDate: day(3), endDate: day(10) }),
    );
    expect(second.overlaps.map((o) => o.sponsorName)).toEqual([`${TAG} A`]);
    const other = await createSponsorship(
      admin,
      booking({ sponsorName: `${TAG} C`, placement: 'jobs_index' }),
    );
    expect(other.overlaps).toEqual([]);
  });

  it('rejects http links, remote logos and end dates before start dates', async () => {
    const admin = viewerFor('admin');
    await expect(
      createSponsorship(
        admin,
        booking({ creative: { headline: 'Hello there', url: 'http://sponsor.example' } }),
      ),
    ).rejects.toThrow(/https/);
    await expect(
      createSponsorship(
        admin,
        booking({
          creative: {
            headline: 'Hello there',
            url: 'https://sponsor.example',
            logoUrl: 'https://cdn.example/pixel.gif',
          },
        }),
      ),
    ).rejects.toThrow(/hosted by us/);
    await expect(
      createSponsorship(admin, booking({ startDate: day(5), endDate: day(1) })),
    ).rejects.toThrow(/end date/);
  });

  it('editing records which fields changed; ending stops it showing today', async () => {
    const admin = viewerFor('admin');
    const { id } = await createSponsorship(admin, booking());
    await updateSponsorship(admin, id, booking({ amount: 750_000 }));
    const [upd] = await adminDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, id), eq(auditLog.action, 'sponsorship.update')));
    expect(upd?.metadata).toMatchObject({ changed: ['amount'] });

    await endSponsorship(admin, id);
    expect(await activeForPlacement('home')).toBeNull();
    const [row] = await adminDb().select().from(sponsorships).where(eq(sponsorships.id, id));
    expect(row!.endDate < isoDay()).toBe(true);
  });

  it('cancelling a future booking keeps its dates in the past and never shows it', async () => {
    const admin = viewerFor('admin');
    const { id } = await createSponsorship(
      admin,
      booking({ startDate: day(10), endDate: day(20) }),
    );
    await endSponsorship(admin, id);
    expect(await activeForPlacement('home', day(12))).toBeNull();
  });

  it('only admins manage sponsorships, in the app and in Postgres', async () => {
    const editor = viewerFor('editor');
    await expect(createSponsorship(editor, booking())).rejects.toThrow(/admins/);
    await expect(listSponsorships(editor)).rejects.toThrow(/admins/);
    // Second wall: RLS refuses the insert even if the app check were bypassed.
    await expect(
      withUser({ userId: editor.id, roles: editor.roles }, (tx) =>
        tx.insert(sponsorships).values({ ...booking(), placement: 'home' } as never),
      ),
    ).rejects.toThrow();
  });

  it('the newsletter helper picks the booking live on the issue date', async () => {
    const admin = viewerFor('admin');
    await createSponsorship(
      admin,
      booking({ placement: 'newsletter', startDate: day(7), endDate: day(14) }),
    );
    expect(await activeSponsorship('newsletter', new Date())).toBeNull();
    expect(await activeSponsorship('newsletter', day(8))).toMatchObject({
      sponsorName: `${TAG} A`,
      url: 'https://sponsor.example/report',
    });
  });
});

describe('agent monitoring', () => {
  const runIds: string[] = [];

  beforeAll(async () => {
    const rows = await adminDb()
      .insert(agentRuns)
      .values([
        {
          agent: 'test-agent',
          model: 'claude-haiku-5-5',
          promptVersion: 't',
          status: 'succeeded',
          tokensIn: 100,
          tokensOut: 50,
          costMicros: 35,
          latencyMs: 400,
        },
        {
          agent: 'test-agent',
          model: 'claude-haiku-5-5',
          promptVersion: 't',
          status: 'failed',
          costMicros: 10,
          latencyMs: 200,
        },
        {
          agent: 'test-agent',
          model: 'claude-haiku-5-5',
          promptVersion: 't',
          status: 'queued_for_human',
          costMicros: 20,
          latencyMs: 600,
        },
        {
          agent: 'test-agent',
          model: 'claude-haiku-5-5',
          promptVersion: 't',
          status: 'succeeded',
          costMicros: 35,
          latencyMs: 400,
        },
      ])
      .returning({ id: agentRuns.id });
    runIds.push(...rows.map((r) => r.id));
    await adminDb()
      .insert(humanQueue)
      .values({ agentRunId: runIds[2]!, reason: 'Test: output failed validation twice' });
  });

  afterAll(async () => {
    await adminDb().delete(humanQueue).where(inArray(humanQueue.agentRunId, runIds));
    await adminDb().delete(agentRuns).where(inArray(agentRuns.id, runIds));
  });

  it('summarises runs, failure rate and cost per agent', async () => {
    const editor = viewerFor('editor');
    const s = (await summaryByAgent(editor, 1)).find((a) => a.agent === 'test-agent')!;
    expect(s).toMatchObject({
      runs: 4,
      failed: 1,
      queued: 1,
      failureRate: 0.5,
      costMicros: 100,
      avgLatencyMs: 400,
    });
    const daily = (await costByDay(editor, 30)).find((a) => a.agent === 'test-agent')!;
    expect(daily.days).toHaveLength(30);
    expect(daily.days.at(-1)!.costMicros).toBe(100);
  });

  it('filters runs by status', async () => {
    const editor = viewerFor('editor');
    const failed = await listRuns(editor, { agent: 'test-agent', status: 'failed', days: 1 });
    expect(failed).toHaveLength(1);
  });

  it('a staff member resolves a human-queue item in their own name, audited, once', async () => {
    const talent = viewerFor('talent');
    const [item] = (await openQueue(talent)).filter((q) => q.agent === 'test-agent');
    expect(item).toBeDefined();
    await resolveQueueItem(talent, item!.id);
    const [row] = await adminDb().select().from(humanQueue).where(eq(humanQueue.id, item!.id));
    expect(row!.resolvedBy).toBe(talent.id);
    const [entry] = await adminDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.targetId, item!.id), eq(auditLog.action, 'human_queue.resolve')));
    expect(entry?.actorId).toBe(talent.id);
    await expect(resolveQueueItem(talent, item!.id)).rejects.toThrow(/Already resolved/);
  });

  it('is staff-only, and Postgres shows non-staff no runs at all', async () => {
    const employer = viewerFor('employer');
    await expect(summaryByAgent(employer)).rejects.toThrow(/staff/);
    const rows = await withUser({ userId: employer.id, roles: employer.roles }, (tx) =>
      tx.select().from(agentRuns),
    );
    expect(rows).toHaveLength(0);
  });
});
