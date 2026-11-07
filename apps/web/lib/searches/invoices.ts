import 'server-only';
import type { Currency, SearchPlan } from '@cmobeat/config';
import { adminDb, audit, companies, mandates, payments, searches } from '@cmobeat/db';
import { sendEmail } from '@cmobeat/email';
import {
  buildFakeInvoicePaidEvent,
  fakePaymentsSecret,
  paymentsProvider,
  type PaymentEvent,
} from '@cmobeat/payments';
import { and, desc, eq } from 'drizzle-orm';
import { invoiceIssuedEmail, invoiceReceiptEmail } from '@/emails/searches';
import { appUrl } from '@/emails/layout';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { employerContacts } from '@/lib/jobs/expiry';
import { feeFor, formatMinor, formatWhole, planLabel, ratePercent, termsOf } from './terms';

/** Payment terms for search invoices. */
export const INVOICE_DUE_DAYS = 30;

/**
 * Invoices live in `payments` (status open → paid). The product key ties each one to its search,
 * and is what makes issuing idempotent:
 *   search_fee:<searchId>                     one success fee per AI-assisted search
 *   fractional_fee:<searchId>:<YYYY-MM>       one fee per month per fractional placement
 */
export const successFeeProduct = (searchId: string) => `search_fee:${searchId}`;
export const fractionalFeeProduct = (searchId: string, month: string) =>
  `fractional_fee:${searchId}:${month}`;
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);

export function parseProduct(
  product: string,
):
  | { kind: 'search_fee'; searchId: string }
  | { kind: 'fractional_fee'; searchId: string; month: string }
  | { kind: 'other'; product: string } {
  const [kind, searchId, month] = product.split(':');
  if (kind === 'search_fee' && searchId) return { kind, searchId };
  if (kind === 'fractional_fee' && searchId && month) return { kind, searchId, month };
  return { kind: 'other', product };
}

const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** The single invoice line, rebuilt from the search so the page and the provider always agree. */
export function invoiceLine(
  s: { plan: SearchPlan; feeTerms: unknown; placementComp: number; title: string },
  currency: string,
  month?: string,
) {
  const terms = termsOf(s.plan, s.feeTerms);
  const amountMinor = feeFor(s.plan, s.feeTerms, s.placementComp);
  const description =
    s.plan === 'ai_search'
      ? `${planLabel.ai_search} success fee: ${ratePercent(terms.rateBps)} of first-year cash compensation (${formatWhole(s.placementComp, currency)}). ${s.title}.`
      : `${planLabel.fractional_match} fee for ${monthName(month!)}: ${ratePercent(terms.rateBps)} of the monthly retainer (${formatWhole(s.placementComp, currency)}). ${s.title}.`;
  return { description, amountMinor };
}

async function loadPlaced(searchId: string) {
  const [s] = await adminDb()
    .select({
      id: searches.id,
      plan: searches.plan,
      status: searches.status,
      feeTerms: searches.feeTerms,
      placementComp: searches.placementComp,
      placementCurrency: searches.placementCurrency,
      hiredAt: searches.hiredAt,
      title: mandates.title,
      companyId: mandates.companyId,
      companyName: companies.name,
    })
    .from(searches)
    .innerJoin(mandates, eq(mandates.id, searches.mandateId))
    .innerJoin(companies, eq(companies.id, mandates.companyId))
    .where(eq(searches.id, searchId))
    .limit(1);
  return s ?? null;
}

/**
 * Issue one invoice (system work, owner connection). Locks the search row and checks the product
 * key first, so a retry, a double click or a re-run job never bills twice.
 */
async function issue(searchId: string, product: string, month?: string) {
  const s = await loadPlaced(searchId);
  if (!s || s.placementComp == null || !s.placementCurrency) return null;
  const currency = s.placementCurrency as Currency;
  const line = invoiceLine(
    { plan: s.plan, feeTerms: s.feeTerms, placementComp: s.placementComp, title: s.title },
    currency,
    month,
  );
  const contacts = await employerContacts(s.companyId);

  const issued = await adminDb().transaction(async (tx) => {
    await tx
      .select({ id: searches.id })
      .from(searches)
      .where(eq(searches.id, searchId))
      .for('update');
    const [existing] = await tx
      .select({ ref: payments.stripeRef })
      .from(payments)
      .where(eq(payments.product, product))
      .limit(1);
    if (existing) return { ref: existing.ref, created: false };
    const invoice = await paymentsProvider().createInvoice({
      companyId: s.companyId,
      companyName: s.companyName,
      billingEmail: contacts[0] ?? null,
      searchId,
      lines: [line],
      currency,
      dueDays: INVOICE_DUE_DAYS,
      appOrigin: appUrl(),
    });
    await tx.insert(payments).values({
      companyId: s.companyId,
      stripeRef: invoice.ref,
      product,
      amount: invoice.totalMinor,
      currency,
      status: 'open',
    });
    if (s.plan === 'ai_search') {
      await tx
        .update(searches)
        .set({ invoiceStatus: 'open', stripeInvoiceId: invoice.ref })
        .where(eq(searches.id, searchId));
    } else {
      await tx.update(searches).set({ invoiceStatus: 'open' }).where(eq(searches.id, searchId));
    }
    await audit(tx, {
      actorId: null,
      action: 'invoice.issued',
      targetType: 'search',
      targetId: searchId,
      metadata: { ref: invoice.ref, product, amount: invoice.totalMinor, currency },
    });
    return { ref: invoice.ref, created: true, url: invoice.url, total: invoice.totalMinor };
  });

  if (issued.created) {
    const mail = invoiceIssuedEmail({
      title: s.title,
      description: line.description,
      amount: formatMinor(issued.total!, currency),
      dueDays: INVOICE_DUE_DAYS,
      url: issued.url || `${appUrl()}/billing/invoices/${issued.ref}`,
    });
    for (const to of contacts) {
      await sendEmail({
        to,
        template: 'invoice-issued',
        ...mail,
        payload: { searchId, ref: issued.ref },
      });
    }
  }
  return issued;
}

/** AI-assisted search: one success-fee invoice when the placement is recorded. */
export const issueSuccessFeeInvoice = (searchId: string) =>
  issue(searchId, successFeeProduct(searchId));

/** Fractional match: one invoice for the given month. */
export const issueFractionalInvoice = (searchId: string, at: Date) =>
  issue(searchId, fractionalFeeProduct(searchId, monthKey(at)), monthKey(at));

/**
 * Monthly job: one invoice per running fractional placement for the current month. Idempotent per
 * month. Stops once the search is closed (only "placed" searches are billed).
 */
export async function runFractionalInvoicing({ now = new Date() }: { now?: Date } = {}) {
  const running = await adminDb()
    .select({ id: searches.id, hiredAt: searches.hiredAt })
    .from(searches)
    .where(and(eq(searches.plan, 'fractional_match'), eq(searches.status, 'placed')));
  const month = monthKey(now);
  const created: string[] = [];
  for (const s of running) {
    if (!s.hiredAt || monthKey(s.hiredAt) > month) continue;
    const r = await issueFractionalInvoice(s.id, now);
    if (r?.created) created.push(r.ref);
  }
  return created;
}

/**
 * Webhook: an invoice was paid. Idempotent: only an open invoice turns paid, so a replayed event
 * changes nothing. Called from applyPaymentEvent on the owner connection.
 */
export async function applyInvoicePaid(
  event: Extract<PaymentEvent, { kind: 'invoice.paid' }>,
): Promise<'paid' | 'duplicate' | 'ignored'> {
  const db = adminDb();
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(payments)
      .set({ status: 'paid' })
      .where(and(eq(payments.stripeRef, event.ref), eq(payments.status, 'open')))
      .returning({
        id: payments.id,
        product: payments.product,
        amount: payments.amount,
        currency: payments.currency,
        companyId: payments.companyId,
      });
    if (!row) {
      const [exists] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.stripeRef, event.ref))
        .limit(1);
      return { outcome: exists ? ('duplicate' as const) : ('ignored' as const) };
    }
    const p = parseProduct(row.product);
    if (p.kind === 'search_fee') {
      await tx.update(searches).set({ invoiceStatus: 'paid' }).where(eq(searches.id, p.searchId));
    }
    if (p.kind !== 'other') {
      await audit(tx, {
        actorId: null,
        action: 'invoice.paid',
        targetType: 'search',
        targetId: p.searchId,
        metadata: {
          ref: event.ref,
          eventId: event.eventId,
          amount: row.amount,
          provider: event.provider,
        },
      });
    }
    return { outcome: 'paid' as const, row };
  });

  if (result.outcome === 'paid' && result.row.companyId) {
    const mail = invoiceReceiptEmail({
      amount: formatMinor(result.row.amount, result.row.currency),
      reference: event.ref,
      url: `${appUrl()}/employer/billing`,
    });
    for (const to of await employerContacts(result.row.companyId)) {
      await sendEmail({ to, template: 'invoice-receipt', ...mail, payload: { ref: event.ref } });
    }
  }
  return result.outcome;
}

// ------------------------------------------------------------------ reading invoices

const invoiceColumns = {
  ref: payments.stripeRef,
  product: payments.product,
  amount: payments.amount,
  currency: payments.currency,
  status: payments.status,
  createdAt: payments.createdAt,
  companyId: payments.companyId,
};

/** Everything billed to the viewer's company: job posts, search fees, fractional fees. RLS scoped. */
export async function companyInvoices(viewer: Viewer | null) {
  if (!viewer || !viewer.roles.includes('employer')) return [];
  return asViewer(viewer, (tx) =>
    tx.select(invoiceColumns).from(payments).orderBy(desc(payments.createdAt)).limit(200),
  );
}

export interface InvoiceView {
  ref: string;
  status: string;
  amount: number;
  currency: string;
  createdAt: Date;
  dueAt: Date;
  companyName: string;
  lines: { description: string; amountMinor: number }[];
  searchId: string | null;
}

/**
 * One invoice for its company's members or an admin (payments RLS). Lines are rebuilt from the
 * search so the page always matches what was billed.
 */
export async function getInvoice(viewer: Viewer | null, ref: string): Promise<InvoiceView | null> {
  if (!viewer) return null;
  return asViewer(viewer, async (tx) => {
    const [p] = await tx
      .select({ ...invoiceColumns, companyName: companies.name })
      .from(payments)
      .leftJoin(companies, eq(companies.id, payments.companyId))
      .where(eq(payments.stripeRef, ref))
      .limit(1);
    if (!p) return null;
    const parsed = parseProduct(p.product);
    let lines = [{ description: p.product, amountMinor: p.amount }];
    let searchId: string | null = null;
    if (parsed.kind !== 'other') {
      searchId = parsed.searchId;
      const [s] = await tx
        .select({
          plan: searches.plan,
          feeTerms: searches.feeTerms,
          placementComp: searches.placementComp,
          title: mandates.title,
        })
        .from(searches)
        .innerJoin(mandates, eq(mandates.id, searches.mandateId))
        .where(eq(searches.id, parsed.searchId))
        .limit(1);
      if (s?.placementComp != null) {
        const line = invoiceLine(
          { plan: s.plan, feeTerms: s.feeTerms, placementComp: s.placementComp, title: s.title },
          p.currency,
          parsed.kind === 'fractional_fee' ? parsed.month : undefined,
        );
        lines = [{ description: line.description, amountMinor: p.amount }];
      }
    } else if (p.product.startsWith('job_post_')) {
      lines = [
        {
          description:
            p.product === 'job_post_featured' ? 'Job post, featured CMO' : 'Job post, standard',
          amountMinor: p.amount,
        },
      ];
    }
    return {
      ref: p.ref,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      createdAt: p.createdAt,
      dueAt: new Date(p.createdAt.getTime() + INVOICE_DUE_DAYS * 86_400_000),
      companyName: p.companyName ?? 'Company',
      lines,
      searchId,
    };
  });
}

/** Staff-only TEST action: send a signed invoice.paid event to the real webhook (fake provider). */
export async function markInvoicePaidTest(viewer: Viewer | null, ref: string, origin: string) {
  if (!viewer?.roles.includes('admin')) throw new Error('Only admins can mark test invoices paid.');
  if (paymentsProvider().name !== 'fake') throw new Error('Test payments are disabled.');
  const invoice = await getInvoice(viewer, ref);
  if (!invoice || invoice.status !== 'open') return false;
  const { body, headers } = buildFakeInvoicePaidEvent(
    { ref, amountPaid: invoice.amount },
    fakePaymentsSecret(),
  );
  const res = await fetch(`${origin}/api/billing/webhook`, {
    method: 'POST',
    body,
    headers,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Webhook rejected the test payment (${res.status})`);
  return true;
}
