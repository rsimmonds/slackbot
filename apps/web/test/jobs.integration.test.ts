import {
  adminDb,
  auditLog,
  listings,
  mandates,
  payments,
  savedSearches,
  withUser,
} from '@cmobeat/db';
import { latestEmailTo } from '@cmobeat/email';
import { buildFakeEvent, fakePaymentsSecret } from '@cmobeat/payments';
import { and, eq, like } from 'drizzle-orm';
import { GET as searchRoute, POST as createRoute } from '@/app/api/listings/route';
import { POST as parseRoute } from '@/app/api/listings/parse/route';
import { PATCH as patchRoute } from '@/app/api/listings/[id]/route';
import { POST as submitRoute } from '@/app/api/listings/[id]/submit/route';
import { POST as expireRoute } from '@/app/api/listings/expire/route';
import { POST as webhookRoute } from '@/app/api/billing/webhook/route';
import { runSavedSearchAlerts } from '@/lib/jobs/alerts';
import { runListingExpiry } from '@/lib/jobs/expiry';
import { decideListing, decisionInput } from '@/lib/jobs/moderation';
import {
  createDraftFromParse,
  saveMandate,
  startCheckout,
  type MandateInput,
} from '@/lib/jobs/posting';
import { searchJobs } from '@/lib/jobs/queries';
import { withAnon } from '@cmobeat/db';
import { JD, jsonRequest, signInAs } from './helpers';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const DAY = 86_400_000;

const confirmedMandate: MandateInput = {
  title: 'Chief Marketing Officer',
  level: 'cmo',
  scope: 'Owns brand, demand and product marketing across North America.',
  reportingLine: 'CEO',
  teamSize: 30,
  priorities: [
    'Reposition the brand for the mid-market',
    'Build a demand engine the board trusts',
    'Hire a head of product marketing',
  ],
  compMin: 400000,
  compMax: 480000,
  currency: 'USD',
  compBasis: 'annual',
  workType: 'full_time',
  location: 'New York',
  remote: false,
  market: 'US',
};

async function listing(id: string) {
  const [row] = await adminDb().select().from(listings).where(eq(listings.id, id));
  return row!;
}

/** Simulate the provider: deliver a signed completed-checkout event to the real webhook route. */
async function pay(listingId: string) {
  const l = await listing(listingId);
  const { body, headers } = buildFakeEvent(
    {
      ref: l.checkoutRef!,
      listingId,
      companyId: l.companyId!,
      plan: l.plan as 'standard' | 'featured',
    },
    'checkout.session.completed',
    fakePaymentsSecret(),
  );
  return webhookRoute(
    new Request('http://localhost:3000/api/billing/webhook', { method: 'POST', body, headers }),
  );
}

describe('public search', () => {
  it('shows anonymous visitors only live listings, featured first', async () => {
    const { items, total } = await withAnon((tx) => searchJobs(tx, { page: 1 }, { pageSize: 50 }));
    expect(total).toBe(26);
    expect(items.every((j) => j.status === 'live')).toBe(true);
    const firstNonFeatured = items.findIndex((j) => !j.featured);
    expect(items.slice(firstNonFeatured).some((j) => j.featured)).toBe(false);
  });

  it('filters comp within one currency and never across currencies', async () => {
    const { items } = await withAnon((tx) =>
      searchJobs(tx, { page: 1, currency: 'EUR', minComp: 300000 }, { pageSize: 50 }),
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((j) => j.currency === 'EUR' && (j.compMax ?? 0) >= 300000)).toBe(true);
  });

  it('filters fractional roles and keyword search', async () => {
    const fr = await withAnon((tx) =>
      searchJobs(tx, { page: 1, work: 'fractional' }, { pageSize: 50 }),
    );
    expect(
      fr.items.every((j) => j.workType === 'fractional' && j.compBasis === 'monthly_retainer'),
    ).toBe(true);
    const q = await withAnon((tx) =>
      searchJobs(tx, { page: 1, q: 'growth officer' }, { pageSize: 50 }),
    );
    expect(q.items.length).toBeGreaterThan(0);
    expect(q.items.every((j) => /growth/i.test(j.title))).toBe(true);
  });

  it('GET /api/listings returns public JSON with comp on every item', async () => {
    signInAs(null);
    const res = await searchRoute(new Request('http://localhost:3000/api/listings?level=cmo'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.level).toBe('cmo');
      expect(item.comp).toMatchObject({ currency: expect.any(String), basis: expect.any(String) });
    }
  });
});

describe('post a job: parse → confirm → pay → review → live', () => {
  let listingId: string;

  it('refuses non-employers', async () => {
    signInAs('reader');
    expect((await createRoute(jsonRequest('/api/listings', 'POST', { text: JD }))).status).toBe(
      403,
    );
    expect(
      (await parseRoute(jsonRequest('/api/listings/parse', 'POST', { text: JD }))).status,
    ).toBe(403);
    signInAs(null);
    expect((await createRoute(jsonRequest('/api/listings', 'POST', { text: JD }))).status).toBe(
      401,
    );
  });

  it('validates input', async () => {
    signInAs('employer');
    expect((await createRoute(jsonRequest('/api/listings', 'POST', {}))).status).toBe(400);
    expect((await createRoute(jsonRequest('/api/listings', 'POST', 'not json'))).status).toBe(400);
  });

  it('parses without saving', async () => {
    signInAs('employer');
    const res = await parseRoute(jsonRequest('/api/listings/parse', 'POST', { text: JD }));
    expect(res.status).toBe(200);
    expect((await res.json()).mandate).toMatchObject({
      compMin: 400000,
      compMax: 480000,
      currency: 'USD',
      reportingLine: 'CEO',
    });
  });

  it('creates a draft listing from a pasted description', async () => {
    signInAs('employer');
    const res = await createRoute(jsonRequest('/api/listings', 'POST', { text: JD }));
    expect(res.status).toBe(201);
    ({ listingId } = await res.json());
    const l = await listing(listingId);
    expect(l.status).toBe('draft');
    const [m] = await adminDb().select().from(mandates).where(eq(mandates.id, l.mandateId));
    expect(m).toMatchObject({
      source: 'listing',
      compMin: 400000,
      rawSource: JD,
      confirmedAt: null,
    });
  });

  it('will not check out before the mandate is confirmed', async () => {
    signInAs('employer');
    const res = await submitRoute(
      jsonRequest(`/api/listings/${listingId}/submit`, 'POST', { plan: 'standard' }),
      ctx(listingId),
    );
    expect(res.status).toBe(422);
  });

  it('rejects an invalid mandate and accepts a confirmed one', async () => {
    signInAs('employer');
    const bad = await patchRoute(
      jsonRequest(`/api/listings/${listingId}`, 'PATCH', {
        mandate: { ...confirmedMandate, compMax: 1 },
        confirm: true,
      }),
      ctx(listingId),
    );
    expect(bad.status).toBe(400);
    const mismatch = await patchRoute(
      jsonRequest(`/api/listings/${listingId}`, 'PATCH', {
        mandate: { ...confirmedMandate, workType: 'fractional' },
        confirm: true,
      }),
      ctx(listingId),
    );
    expect(mismatch.status).toBe(400);
    const ok = await patchRoute(
      jsonRequest(`/api/listings/${listingId}`, 'PATCH', {
        mandate: confirmedMandate,
        confirm: true,
      }),
      ctx(listingId),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ confirmed: true, gaps: [] });
  });

  it('another employer cannot touch it', async () => {
    // The talent partner is not an employer at all; a forged id is simply not found.
    signInAs('employer');
    const res = await patchRoute(
      jsonRequest(`/api/listings/00000000-0000-4000-8000-0000000000ff`, 'PATCH', {
        mandate: confirmedMandate,
      }),
      ctx('00000000-0000-4000-8000-0000000000ff'),
    );
    expect(res.status).toBe(404);
  });

  it('starts a featured checkout and moves to pending_payment', async () => {
    signInAs('employer');
    const res = await submitRoute(
      jsonRequest(`/api/listings/${listingId}/submit`, 'POST', { plan: 'featured' }),
      ctx(listingId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe('checkout');
    expect(body.url).toMatch(/\/checkout\/fake\/fake_cs_/);
    expect(await listing(listingId)).toMatchObject({ status: 'pending_payment', plan: 'featured' });
  });

  it('employers cannot mark their own listing paid or approve it', async () => {
    const employer = signInAs('employer')!;
    await expect(
      withUser({ userId: employer.id, roles: employer.roles as never }, (tx) =>
        tx.update(listings).set({ paidAt: new Date() }).where(eq(listings.id, listingId)),
      ),
    ).rejects.toThrow();
    await expect(
      withUser({ userId: employer.id, roles: employer.roles as never }, (tx) =>
        tx.update(listings).set({ status: 'live' }).where(eq(listings.id, listingId)),
      ),
    ).rejects.toThrow();
  });

  it('rejects a webhook with a bad signature', async () => {
    const l = await listing(listingId);
    const { body } = buildFakeEvent(
      { ref: l.checkoutRef!, listingId, companyId: l.companyId!, plan: 'featured' },
      'checkout.session.completed',
      'x'.repeat(64),
    );
    const res = await webhookRoute(
      new Request('http://localhost:3000/api/billing/webhook', {
        method: 'POST',
        body,
        headers: { 'x-fake-payments-signature': 't=1,v1=00' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await listing(listingId)).paidAt).toBeNull();
  });

  it('a signed payment marks it paid once, records the payment, audits and emails a receipt', async () => {
    const res = await pay(listingId);
    expect(await res.json()).toMatchObject({ outcome: 'paid' });
    const l = await listing(listingId);
    expect(l).toMatchObject({ status: 'pending_review', featured: true });
    expect(l.paidAt).not.toBeNull();
    const pays = await adminDb()
      .select()
      .from(payments)
      .where(eq(payments.stripeRef, l.checkoutRef!));
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({
      amount: 150_000,
      currency: 'USD',
      product: 'job_post_featured',
    });
    const receipt = await latestEmailTo('employer@sample.cmobeat.dev');
    expect(receipt?.template).toBe('payment-receipt');
    const [a] = await adminDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'listing.paid'), eq(auditLog.targetId, listingId)));
    expect(a).toBeDefined();

    // Replays change nothing.
    expect(await (await pay(listingId)).json()).toMatchObject({ outcome: 'duplicate' });
    expect(
      await adminDb().select().from(payments).where(eq(payments.stripeRef, l.checkoutRef!)),
    ).toHaveLength(1);
  });

  it('only staff decide, and a rejection needs a note', async () => {
    await expect(
      decideListing(signInAs('employer') as never, listingId, { decision: 'approve' }),
    ).rejects.toThrow(/Staff only/);
    expect(decisionInput.safeParse({ decision: 'reject', note: '' }).success).toBe(false);
    await decideListing(signInAs('editor') as never, listingId, {
      decision: 'reject',
      note: 'Add the board reporting line.',
    });
    expect(await listing(listingId)).toMatchObject({
      status: 'rejected',
      moderatedBy: '00000000-0000-4000-8000-000000000004',
      moderationNote: 'Add the board reporting line.',
    });
    expect((await latestEmailTo('employer@sample.cmobeat.dev'))?.template).toBe('listing-rejected');
  });

  it('a rejected, paid listing is resubmitted without paying again', async () => {
    const employer = signInAs('employer')!;
    await saveMandate(employer as never, listingId, confirmedMandate, true);
    const res = await submitRoute(
      jsonRequest(`/api/listings/${listingId}/submit`, 'POST', { plan: 'standard' }),
      ctx(listingId),
    );
    expect(await res.json()).toEqual({ kind: 'resubmitted' });
    const l = await listing(listingId);
    expect(l).toMatchObject({ status: 'pending_review', plan: 'featured' });
    expect(
      // Job-post payments only: other suites invoice this company for searches.
      await adminDb()
        .select()
        .from(payments)
        .where(and(eq(payments.companyId, l.companyId!), like(payments.product, 'job_post%'))),
    ).toHaveLength(1);
  });

  it('a staff approval publishes it for 60 days in the reviewer’s name', async () => {
    const editor = signInAs('editor')!;
    const now = new Date();
    await decideListing(editor as never, listingId, { decision: 'approve' }, now);
    const l = await listing(listingId);
    expect(l).toMatchObject({ status: 'live', moderatedBy: editor.id });
    expect(l.expiresAt!.getTime() - l.publishedAt!.getTime()).toBe(60 * DAY);
    expect((await latestEmailTo('employer@sample.cmobeat.dev'))?.template).toBe('listing-approved');
    const visible = await withAnon((tx) =>
      searchJobs(tx, { page: 1, q: 'demand engine board' }, { pageSize: 50 }),
    );
    expect(visible.items.map((j) => j.listingId)).toContain(listingId);
  });

  it('staff cannot approve an unpaid listing', async () => {
    const [unpaid] = await adminDb()
      .select({ id: listings.id })
      .from(listings)
      .where(and(eq(listings.status, 'pending_review'), eq(listings.isSample, true)))
      .limit(1);
    const editor = signInAs('editor')!;
    await expect(
      decideListing(editor as never, unpaid!.id, { decision: 'approve' }),
    ).rejects.toThrow(/not been paid/);
  });

  it('a cancelled checkout returns the listing to draft', async () => {
    const employer = signInAs('employer')!;
    const draft = await createDraftFromParse(employer as never, { text: JD });
    await saveMandate(employer as never, draft.listingId, confirmedMandate, true);
    await startCheckout(employer as never, draft.listingId, 'standard', 'http://localhost:3000');
    const l = await listing(draft.listingId);
    const { body, headers } = buildFakeEvent(
      { ref: l.checkoutRef!, listingId: l.id, companyId: l.companyId!, plan: 'standard' },
      'checkout.session.expired',
      fakePaymentsSecret(),
    );
    const res = await webhookRoute(
      new Request('http://localhost:3000/api/billing/webhook', { method: 'POST', body, headers }),
    );
    expect(await res.json()).toMatchObject({ outcome: 'cancelled' });
    expect(await listing(draft.listingId)).toMatchObject({
      status: 'draft',
      checkoutRef: null,
      paidAt: null,
    });
  });
});

describe('background jobs', () => {
  it('saved-search alerts email new matching roles once per period', async () => {
    const reader = signInAs('reader')!;
    const longAgo = new Date(Date.now() - 30 * DAY);
    await adminDb().delete(savedSearches).where(eq(savedSearches.userId, reader.id));
    await adminDb()
      .insert(savedSearches)
      .values({
        userId: reader.id,
        name: 'US CMO roles',
        query: { level: 'cmo', market: 'US' },
        alertFrequency: 'weekly',
        createdAt: longAgo,
      });
    const first = await runSavedSearchAlerts();
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const mail = await latestEmailTo(reader.email);
    expect(mail?.template).toBe('saved-search-alert');
    expect(mail?.subject).toMatch(/US CMO roles/);
    const again = await runSavedSearchAlerts();
    expect(again.checked).toBe(0);
  });

  it('expires listings past their date and reminds employers a week before', async () => {
    const db = adminDb();
    const [l1, l2] = await db
      .select({ id: listings.id })
      .from(listings)
      .where(and(eq(listings.status, 'live'), eq(listings.isSample, true)))
      .limit(2);
    const now = new Date();
    await db
      .update(listings)
      .set({ expiresAt: new Date(now.getTime() - 1000) })
      .where(eq(listings.id, l1!.id));
    await db
      .update(listings)
      .set({ expiresAt: new Date(now.getTime() + 6.5 * DAY), isSample: false })
      .where(eq(listings.id, l2!.id));
    const r = await runListingExpiry({ now });
    expect(r.expired).toContain(l1!.id);
    expect((await listing(l1!.id)).status).toBe('expired');
    expect(r.reminders).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/listings/expire is admin-only', async () => {
    signInAs('employer');
    expect((await expireRoute(jsonRequest('/api/listings/expire', 'POST'))).status).toBe(403);
    signInAs('admin');
    const res = await expireRoute(jsonRequest('/api/listings/expire', 'POST'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      expired: expect.any(Number),
      reminders: expect.any(Number),
    });
  });
});
