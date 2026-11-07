import { adminDb, closeDb, emailOutbox, subscribers, withAnon } from '@cmobeat/db';
import { latestEmailTo } from '@cmobeat/email';
import { eq, sql } from 'drizzle-orm';
import { POST as confirmPOST } from '@/app/api/newsletter/confirm/route';
import { GET as prefsGET, POST as prefsPOST } from '@/app/api/newsletter/preferences/route';
import { POST as subscribePOST } from '@/app/api/newsletter/subscribe/route';
import { POST as unsubscribePOST } from '@/app/api/newsletter/unsubscribe/route';
import { RateLimiter, signupLimiter } from '@/lib/newsletter/rate-limit';
import { consentText, maskEmail, signup } from '@/lib/newsletter/service';

let ipCounter = 0;
const nextIp = () => `203.0.113.${++ipCounter}`;

const post = (path: string, body: unknown, ip = nextIp()) =>
  new Request(`https://cmobeat.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });

const tokenFrom = (html: string, param: 'token') => {
  const m = html.match(new RegExp(`[?&]${param}=([0-9a-f]{64})`));
  if (!m) throw new Error('token not found in email');
  return m[1]!;
};

async function subscribeAndConfirm(email: string) {
  const res = await subscribePOST(
    post('/api/newsletter/subscribe', { email, market: 'CA', topics: ['moves'] }),
  );
  expect(res.status).toBe(200);
  const confirmMail = await latestEmailTo(email);
  const confirmToken = tokenFrom(String(confirmMail!.payload.html), 'token');
  const c = await confirmPOST(post('/api/newsletter/confirm', { token: confirmToken }));
  expect(c.status).toBe(200);
  const welcome = await latestEmailTo(email);
  expect(welcome!.template).toBe('newsletter-welcome');
  return { confirmToken, manageToken: tokenFrom(String(welcome!.payload.html), 'token') };
}

beforeEach(() => signupLimiter.reset());
afterAll(() => closeDb());

describe('newsletter double opt-in', () => {
  it('stays pending and sends only a confirmation until the owner confirms', async () => {
    const email = 'pending@sample.cmobeat.dev';
    const res = await subscribePOST(post('/api/newsletter/subscribe', { email, market: 'EU' }));
    expect(res.status).toBe(200);
    const [row] = await adminDb().select().from(subscribers).where(eq(subscribers.email, email));
    expect(row).toMatchObject({ status: 'pending', market: 'EU', consentText });
    expect(row!.consentAt).toBeInstanceOf(Date);
    const mail = await latestEmailTo(email);
    expect(mail).toMatchObject({ template: 'newsletter-confirm', provider: 'outbox' });
    expect(String(mail!.payload.text)).toContain('/newsletter/confirm?token=');
  });

  it('activates on confirm, sends a welcome with one-click unsubscribe headers, and rejects reuse', async () => {
    const email = 'confirm@sample.cmobeat.dev';
    const { confirmToken } = await subscribeAndConfirm(email);
    const [row] = await adminDb().select().from(subscribers).where(eq(subscribers.email, email));
    expect(row).toMatchObject({ status: 'active', confirmToken: null });
    const welcome = await latestEmailTo(email);
    expect(welcome!.payload.headers).toMatchObject({
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    const again = await confirmPOST(post('/api/newsletter/confirm', { token: confirmToken }));
    expect(again.status).toBe(400);
  });

  it('gives the same response for an existing subscriber and sends nothing new', async () => {
    const email = 'existing@sample.cmobeat.dev';
    await subscribeAndConfirm(email);
    const before = await adminDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(emailOutbox)
      .where(eq(emailOutbox.toEmail, email));
    const res = await subscribePOST(post('/api/newsletter/subscribe', { email }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    const after = await adminDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(emailOutbox)
      .where(eq(emailOutbox.toEmail, email));
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  it('updates preferences and unsubscribes with one click (RFC 8058)', async () => {
    const email = 'prefs@sample.cmobeat.dev';
    const { manageToken } = await subscribeAndConfirm(email);

    const got = await prefsGET(
      new Request(`https://cmobeat.test/api/newsletter/preferences?token=${manageToken}`),
    );
    expect(await got.json()).toMatchObject({ ok: true, email: maskEmail(email), status: 'active' });

    const upd = await prefsPOST(
      post('/api/newsletter/preferences', {
        token: manageToken,
        frequency: 'monthly',
        topics: ['comp', 'jobs'],
      }),
    );
    expect(upd.status).toBe(200);
    const [row] = await adminDb().select().from(subscribers).where(eq(subscribers.email, email));
    expect(row!.preferences).toEqual({ frequency: 'monthly', topics: ['comp', 'jobs'] });

    const oneClick = await unsubscribePOST(
      new Request(`https://cmobeat.test/api/newsletter/unsubscribe?token=${manageToken}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
    );
    expect(oneClick.status).toBe(200);
    const [after] = await adminDb().select().from(subscribers).where(eq(subscribers.email, email));
    expect(after).toMatchObject({ status: 'unsubscribed' });
    expect(after!.unsubscribedAt).toBeInstanceOf(Date);
  });

  it('rejects invalid input and bad tokens', async () => {
    expect((await subscribePOST(post('/api/newsletter/subscribe', { email: 'nope' }))).status).toBe(
      400,
    );
    expect(
      (await subscribePOST(post('/api/newsletter/subscribe', { email: 'a@b.co', market: 'MARS' })))
        .status,
    ).toBe(400);
    expect((await confirmPOST(post('/api/newsletter/confirm', { token: 'x' }))).status).toBe(400);
    expect(
      (await prefsGET(new Request('https://cmobeat.test/api/newsletter/preferences?token=abc')))
        .status,
    ).toBe(404);
    expect(
      (
        await prefsPOST(
          post('/api/newsletter/preferences', {
            token: 'f'.repeat(64),
            frequency: 'daily',
            topics: [],
          }),
        )
      ).status,
    ).toBe(400);
    expect((await unsubscribePOST(post('/api/newsletter/unsubscribe', {}))).status).toBe(400);
  });

  it('silently drops bots that fill the honeypot', async () => {
    const email = 'bot@sample.cmobeat.dev';
    const res = await subscribePOST(
      post('/api/newsletter/subscribe', { email, website: 'http://spam.example' }),
    );
    expect(res.status).toBe(200);
    const rows = await adminDb().select().from(subscribers).where(eq(subscribers.email, email));
    expect(rows).toHaveLength(0);
  });

  it('rate-limits repeated signups from one address', async () => {
    const limiter = new RateLimiter(2, 60_000);
    const ip = '198.51.100.7';
    expect(await signup({ email: 'r1@sample.cmobeat.dev' }, { ip, limiter })).toEqual({ ok: true });
    expect(await signup({ email: 'r2@sample.cmobeat.dev' }, { ip, limiter })).toEqual({ ok: true });
    expect(await signup({ email: 'r3@sample.cmobeat.dev' }, { ip, limiter })).toMatchObject({
      ok: false,
      error: 'rate_limited',
    });
  });

  it('keeps the subscriber list unreadable to visitors', async () => {
    await expect(withAnon((tx) => tx.select().from(subscribers))).resolves.toEqual([]);
  });
});
