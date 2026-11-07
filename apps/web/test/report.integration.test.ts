import { adminDb, auditLog, reportDownloads, subscribers, withAnon, withUser } from '@cmobeat/db';
import { latestEmailTo } from '@cmobeat/email';
import { and, eq, sql } from 'drizzle-orm';
import { GET as downloadRoute } from '@/app/api/report/download/route';
import { POST as requestRoute } from '@/app/api/report/request/route';
import { GET as leadsExport } from '@/app/console/leads/export/route';
import { RateLimiter } from '@/lib/newsletter/rate-limit';
import { confirm } from '@/lib/newsletter/service';
import { compCells, MIN_CELL } from '@/lib/publication/aggregates';
import { datasetCsv, industryDataset, marketDataset } from '@/lib/publication/datasets';
import { listLeads } from '@/lib/report/console';
import { requestReport } from '@/lib/report/leads';
import { reportDownloadPath, signReportToken } from '@/lib/report/link';
import { jsonRequest, signInAs } from './helpers';

let n = 0;
const email = (tag: string) => `report-${tag}-${Date.now()}-${++n}@example.com`;
const unlimited = () => new RateLimiter(1000, 60_000);
const req = (body: unknown) =>
  jsonRequest('/api/report/request', 'POST', body, {
    'x-forwarded-for': `198.51.100.${++n % 250}`,
  });
const dl = (path: string) => downloadRoute(new Request(`http://localhost:3000${path}`));

describe('report gate', () => {
  it('rejects an invalid email or a missing market', async () => {
    const bad = await requestRoute(req({ email: 'nope', market: 'US' }));
    expect(bad.status).toBe(400);
    const noMarket = await requestRoute(req({ email: email('nomarket') }));
    expect(noMarket.status).toBe(400);
    expect(((await noMarket.json()) as { message: string }).message).toMatch(/where you work/i);
  });

  it('answers a filled honeypot like a success and records nothing', async () => {
    const addr = email('bot');
    const r = await requestReport(
      { email: addr, market: 'US', website: 'http://spam' },
      { limiter: unlimited() },
    );
    expect(r).toMatchObject({ ok: true, downloadPath: null });
    const rows = await adminDb()
      .select()
      .from(reportDownloads)
      .where(eq(reportDownloads.email, addr));
    expect(rows).toHaveLength(0);
  });

  it('rate-limits by IP', async () => {
    const limiter = new RateLimiter(1, 60_000);
    const first = await requestReport(
      { email: email('rl1'), market: 'CA' },
      { ip: '203.0.113.9', limiter },
    );
    const second = await requestReport(
      { email: email('rl2'), market: 'CA' },
      { ip: '203.0.113.9', limiter },
    );
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, error: 'rate_limited' });
  });

  it('without opt-in: records a lead and emails the link, but creates no subscription', async () => {
    const addr = email('noopt');
    const r = await requestReport(
      { email: addr, market: 'EU', company: 'Sample Co', role: 'CMO' },
      { limiter: unlimited() },
    );
    expect(r.ok && r.downloadPath).toMatch(/^\/api\/report\/download\?d=/);
    const [lead] = await adminDb()
      .select()
      .from(reportDownloads)
      .where(eq(reportDownloads.email, addr));
    expect(lead).toMatchObject({
      newsletterOptIn: false,
      subscriberId: null,
      market: 'EU',
      company: 'Sample Co',
    });
    expect(
      await adminDb().select().from(subscribers).where(eq(subscribers.email, addr)),
    ).toHaveLength(0);
    const mail = await latestEmailTo(addr);
    expect(mail!.template).toBe('report-download');
  });

  it('with opt-in: a pending subscriber in the report segment, a confirm email, and confirming activates it', async () => {
    const addr = email('opt');
    const res = await requestRoute(req({ email: addr, market: 'UK', newsletter: 'on' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, newsletterPending: true });
    const [sub] = await adminDb().select().from(subscribers).where(eq(subscribers.email, addr));
    expect(sub).toMatchObject({ status: 'pending', source: 'report:2026', market: 'UK' });
    expect(sub!.segments).toContain('report');
    const [lead] = await adminDb()
      .select()
      .from(reportDownloads)
      .where(eq(reportDownloads.email, addr));
    expect(lead).toMatchObject({ newsletterOptIn: true, subscriberId: sub!.id });

    const sent = await adminDb()
      .select({ template: sql<string>`template` })
      .from(sql`email_outbox`)
      .where(sql`to_email = ${addr}`);
    expect(sent.map((s) => s.template).sort()).toEqual(['newsletter-confirm', 'report-download']);
    expect(await confirm(sub!.confirmToken)).toBe(true);
    const [after] = await adminDb().select().from(subscribers).where(eq(subscribers.email, addr));
    expect(after!.status).toBe('active');
  });
});

describe('signed download links', () => {
  it('serves the PDF for a valid link and refuses tampered, expired or misdirected ones', async () => {
    const r = await requestReport({ email: email('dl'), market: 'US' }, { limiter: unlimited() });
    if (!r.ok || !r.downloadPath) throw new Error('no link');
    const ok = await dl(r.downloadPath);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/pdf');
    const bytes = new Uint8Array(await ok.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(5_000);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');

    const id = new URL(r.downloadPath, 'http://x').searchParams.get('d')!;
    expect((await dl(r.downloadPath.replace(/t=[^&]+/, 't=1.forged'))).status).toBe(403);
    const expired = reportDownloadPath(id, 60, Date.now() - 2 * 3600_000);
    expect((await dl(expired)).status).toBe(403);
    // A valid token for one lead does not open another id.
    const other = crypto.randomUUID();
    const t = encodeURIComponent(signReportToken(id, 3600));
    expect((await dl(`/api/report/download?d=${other}&t=${t}`)).status).toBe(403);
    // A correctly signed token for an id that is not a lead is refused too.
    const t2 = encodeURIComponent(signReportToken(other, 3600));
    expect((await dl(`/api/report/download?d=${other}&t=${t2}`)).status).toBe(403);
  });
});

describe('leads console', () => {
  it('editors list leads; nobody else can, in the app or in the database', async () => {
    const editor = signInAs('editor')!;
    const leads = await listLeads(editor as never);
    expect(leads.length).toBeGreaterThan(0);
    for (const who of ['reader', 'employer', 'talent'] as const) {
      const v = signInAs(who)!;
      await expect(listLeads(v as never)).rejects.toThrow(/editors/);
      const rows = await withUser({ userId: v.id, roles: v.roles as never }, (tx) =>
        tx.select().from(reportDownloads),
      );
      expect(rows).toHaveLength(0);
    }
    expect(await withAnon((tx) => tx.select().from(reportDownloads))).toHaveLength(0);
  });

  it('exports CSV for editors only, and audit-logs each export', async () => {
    signInAs('reader');
    expect((await leadsExport()).status).toBe(403);
    const editor = signInAs('editor')!;
    const res = await leadsExport();
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv.split('\n')[0]).toBe(
      'requested_at,email,company,role,market,newsletter_opt_in,newsletter_confirmed',
    );
    const logged = await adminDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.actorId, editor.id), eq(auditLog.action, 'report_leads.export')));
    expect(logged.length).toBeGreaterThan(0);
  });
});

describe('public data pages', () => {
  it('withholds comp groups under the minimum and never puts an email in a CSV', async () => {
    const { cells } = await withAnon((tx) => compCells(tx));
    expect(cells.every((c) => c.n >= MIN_CELL)).toBe(true);
    const market = await marketDataset('us');
    expect(market).not.toBeNull();
    const csv = datasetCsv(market!);
    expect(csv).not.toMatch(/@/);
    expect(csv.split('\n')[0]).toBe('metric,group,value,n,currency,basis');
    expect(await marketDataset('xx')).toBeNull();
    expect(await industryDataset('no-such-industry')).toBeNull();
  });
});
