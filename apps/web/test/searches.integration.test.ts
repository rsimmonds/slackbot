import { adminDb, auditLog, emailOutbox, payments, searches } from '@cmobeat/db';
import { latestEmailTo } from '@cmobeat/email';
import { buildFakeInvoicePaidEvent, fakePaymentsSecret } from '@cmobeat/payments';
import { and, eq, like } from 'drizzle-orm';
import { POST as webhookRoute } from '@/app/api/billing/webhook/route';
import { GET as invoicesRoute } from '@/app/api/billing/invoices/route';
import { GET as listRoute, POST as requestRoute } from '@/app/api/searches/route';
import { POST as assignRoute } from '@/app/api/searches/[id]/assign/route';
import { POST as placeRoute } from '@/app/api/searches/[id]/place/route';
import { POST as statusRoute } from '@/app/api/searches/[id]/status/route';
import { getInvoice, runFractionalInvoicing } from '@/lib/searches/invoices';
import { getEmployerSearch } from '@/lib/searches/service';
import { jsonRequest, signInAs } from './helpers';
import { confirmedMandate, matchFor, otherCompanyId } from './search-fixtures';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON in tests
const json = async (res: Response) => (await res.json()) as { data?: any; error?: string };

async function request(mandateId: string, plan = 'ai_search', acceptTerms: unknown = true) {
  return requestRoute(jsonRequest('/api/searches', 'POST', { mandateId, plan, acceptTerms }));
}
const assign = (id: string) => assignRoute(new Request('http://x', { method: 'POST' }), ctx(id));
const move = (id: string, status: string) =>
  statusRoute(jsonRequest(`/api/searches/${id}/status`, 'POST', { status }), ctx(id));
const place = (id: string, matchId: string, comp: unknown) =>
  placeRoute(jsonRequest(`/api/searches/${id}/place`, 'POST', { matchId, comp }), ctx(id));

async function search(id: string) {
  const [s] = await adminDb().select().from(searches).where(eq(searches.id, id));
  return s!;
}

/** Requests a search as the employer and takes it to shortlist as the talent partner. */
async function toShortlist(mandateId: string, plan = 'ai_search') {
  signInAs('employer');
  const res = await request(mandateId, plan);
  expect(res.status).toBe(201);
  const id = (await json(res)).data.id as string;
  signInAs('talent');
  expect((await assign(id)).status).toBe(200);
  for (const s of ['sourcing', 'shortlist']) expect((await move(id, s)).status).toBe(200);
  return id;
}

describe('requesting a search', () => {
  it('stores a snapshot of the accepted fee terms and notifies talent partners', async () => {
    const mandateId = await confirmedMandate();
    signInAs('employer');
    const res = await request(mandateId);
    expect(res.status).toBe(201);
    const id = (await json(res)).data.id;
    const s = await search(id);
    expect(s.status).toBe('scoping');
    expect(s.talentPartnerId).toBeNull();
    expect(s.feeTerms).toMatchObject({
      plan: 'ai_search',
      rateBps: 1200,
      basis: 'first_year_cash_comp',
      invoicing: 'on_placement',
      currency: 'USD',
      acceptedBy: expect.any(String),
    });
    const mail = await latestEmailTo('talent@sample.cmobeat.dev');
    expect(mail!.template).toBe('search-requested');
    // One open search per mandate.
    expect((await request(mandateId)).status).toBe(409);
  });

  it('requires accepted terms, the right plan, and a confirmed mandate of your own company', async () => {
    signInAs('employer');
    const fullTime = await confirmedMandate();
    expect((await request(fullTime, 'ai_search', false)).status).toBe(400);
    expect((await request(fullTime, 'fractional_match')).status).toBe(400);
    const unconfirmed = await confirmedMandate({ confirmed: false });
    expect((await request(unconfirmed)).status).toBe(409);
    const foreign = await confirmedMandate({ companyId: await otherCompanyId() });
    expect((await request(foreign)).status).toBe(404);
    // Only employers request searches.
    signInAs('candidate');
    expect((await request(fullTime)).status).toBe(403);
    signInAs(null);
    expect((await request(fullTime)).status).toBe(401);
  });
});

describe('running a search', () => {
  it('only talent partners assign and move it; transitions are enforced; matching failure is friendly', async () => {
    const mandateId = await confirmedMandate();
    signInAs('employer');
    const id = (await json(await request(mandateId))).data.id;
    // The employer can't run their own search.
    expect((await assign(id)).status).toBe(403);
    expect((await move(id, 'sourcing')).status).toBe(403);
    signInAs('talent');
    expect((await move(id, 'sourcing')).status).toBe(403); // take it first
    expect((await assign(id)).status).toBe(200);
    expect((await move(id, 'interviewing')).status).toBe(409); // skip
    expect((await move(id, 'placed')).status).toBe(409); // only via placement
    const sourcing = await json(await move(id, 'sourcing'));
    expect(sourcing.data.status).toBe('sourcing');
    // The matcher is another workstream; until it lands the move still happens, with a warning.
    expect(sourcing.data.warning ?? '').toMatch(/matching|proposals/i);
    const audit = await adminDb()
      .select({ action: auditLog.action, metadata: auditLog.metadata })
      .from(auditLog)
      .where(and(eq(auditLog.targetType, 'search'), eq(auditLog.targetId, id)));
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['search.requested', 'search.assigned', 'search.status']),
    );
    // The employer sees the timeline without names or notes.
    const view = await getEmployerSearch(signInAs('employer') as never, id);
    expect(view.timeline.map((t) => t.label)).toEqual([
      'Search requested and fee terms accepted',
      'A talent partner took the search',
      'Moved to Sourcing',
    ]);
  });

  it('lists searches for the employer and for talent partners, nothing for others', async () => {
    signInAs('employer');
    const mine = await json(await listRoute());
    expect(mine.data.length).toBeGreaterThan(0);
    signInAs('talent');
    const all = await json(await listRoute());
    expect(all.data.length).toBeGreaterThanOrEqual(mine.data.length);
    signInAs('candidate');
    expect((await listRoute()).status).toBe(403);
  });
});

describe('placement and invoicing', () => {
  it('refuses a match that is not revealed, belongs to another mandate, or lost consent', async () => {
    const mandateId = await confirmedMandate();
    const id = await toShortlist(mandateId);
    const approvedOnly = await matchFor(mandateId, { status: 'approved' });
    expect((await place(id, approvedOnly, 400_000)).status).toBe(409);
    const elsewhere = await matchFor(await confirmedMandate());
    expect((await place(id, elsewhere, 400_000)).status).toBe(400);
    const withdrawn = await matchFor(mandateId, { consentWithdrawn: true });
    expect((await place(id, withdrawn, 400_000)).status).toBe(409);
    const revealed = await matchFor(mandateId);
    expect((await place(id, revealed, 400_000.5)).status).toBe(400);
    expect((await place(id, revealed, -1)).status).toBe(400);
    signInAs('employer');
    expect((await place(id, revealed, 400_000)).status).toBe(403);
  });

  it('AI-assisted search: one 12% success-fee invoice, paid once via the webhook', async () => {
    const mandateId = await confirmedMandate();
    const id = await toShortlist(mandateId);
    const matchId = await matchFor(mandateId);
    const res = await place(id, matchId, 400_000);
    expect(res.status).toBe(200);
    const s = await search(id);
    expect(s).toMatchObject({
      status: 'placed',
      placedMatchId: matchId,
      placementComp: 400_000,
      placementCurrency: 'USD',
      invoiceStatus: 'open',
    });
    const rows = await adminDb()
      .select()
      .from(payments)
      .where(eq(payments.product, `search_fee:${id}`));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 4_800_000, currency: 'USD', status: 'open' });
    const ref = rows[0]!.stripeRef;
    expect(ref).toMatch(/^fake_in_/);
    expect((await latestEmailTo('employer@sample.cmobeat.dev'))!.template).toMatch(
      /invoice-issued|search-update/,
    );

    // The employer sees it; a candidate does not.
    signInAs('employer');
    const inv = await json(await invoicesRoute());
    expect(inv.data.find((r: { ref: string }) => r.ref === ref)).toMatchObject({
      kind: 'search_fee',
      amount: 4_800_000,
      status: 'open',
    });
    const page = await getInvoice(signInAs('employer') as never, ref);
    expect(page!.lines[0]!.description).toMatch(
      /12% of first-year cash compensation \(\$400,000\)/,
    );
    signInAs('candidate');
    expect((await invoicesRoute()).status).toBe(403);
    expect(await getInvoice(signInAs('candidate') as never, ref)).toBeNull();

    // Paid through the signed webhook; a replay changes nothing.
    const evt = buildFakeInvoicePaidEvent({ ref, amountPaid: 4_800_000 }, fakePaymentsSecret());
    const first = await webhookRoute(
      new Request('http://x/api/billing/webhook', {
        method: 'POST',
        body: evt.body,
        headers: evt.headers,
      }),
    );
    expect((await first.json()).outcome).toBe('paid');
    const again = await webhookRoute(
      new Request('http://x/api/billing/webhook', {
        method: 'POST',
        body: evt.body,
        headers: evt.headers,
      }),
    );
    expect((await again.json()).outcome).toBe('duplicate');
    expect((await search(id)).invoiceStatus).toBe('paid');
    const [paid] = await adminDb().select().from(payments).where(eq(payments.stripeRef, ref));
    expect(paid!.status).toBe('paid');
    expect((await latestEmailTo('employer@sample.cmobeat.dev'))!.template).toBe('invoice-receipt');

    // A forged event is refused.
    const forged = buildFakeInvoicePaidEvent({ ref, amountPaid: 1 }, 'x'.repeat(64));
    const bad = await webhookRoute(
      new Request('http://x/api/billing/webhook', {
        method: 'POST',
        body: forged.body,
        headers: forged.headers,
      }),
    );
    expect(bad.status).toBe(400);
  });

  it('fractional match: 15% of the retainer, exactly one invoice per month until closed', async () => {
    const mandateId = await confirmedMandate({ workType: 'fractional', currency: 'EUR' });
    const id = await toShortlist(mandateId, 'fractional_match');
    const matchId = await matchFor(mandateId);
    expect((await place(id, matchId, 14_000)).status).toBe(200);
    const invoices = () =>
      adminDb()
        .select({ product: payments.product, amount: payments.amount, currency: payments.currency })
        .from(payments)
        .where(like(payments.product, `fractional_fee:${id}:%`));
    let rows = await invoices();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 210_000, currency: 'EUR' });

    const thisMonth = new Date();
    const nextMonth = new Date(
      Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() + 1, 3),
    );
    const monthAfter = new Date(
      Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() + 2, 3),
    );
    await runFractionalInvoicing({ now: thisMonth });
    expect(await invoices()).toHaveLength(1);
    await runFractionalInvoicing({ now: nextMonth });
    await runFractionalInvoicing({ now: nextMonth });
    expect(await invoices()).toHaveLength(2);

    // Closing the engagement stops billing.
    signInAs('talent');
    expect((await move(id, 'closed')).status).toBe(200);
    await runFractionalInvoicing({ now: monthAfter });
    rows = await invoices();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.amount === 210_000)).toBe(true);
  });

  it('writes every invoice and decision to the audit log, and sends no candidate data by email', async () => {
    const issued = await adminDb()
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.action, 'invoice.issued'));
    expect(issued.length).toBeGreaterThan(0);
    const mails = await adminDb()
      .select({ payload: emailOutbox.payload, template: emailOutbox.template })
      .from(emailOutbox)
      .where(like(emailOutbox.template, 'search%'));
    for (const m of mails)
      expect(JSON.stringify(m.payload)).not.toMatch(/headline|profileId|candidate/i);
  });
});
