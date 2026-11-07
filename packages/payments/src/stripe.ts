import { currencies, type Currency } from '@cmobeat/config';
import Stripe from 'stripe';
import {
  WebhookSignatureError,
  type CheckoutPlan,
  type CheckoutRequest,
  type CheckoutSession,
  type InvoiceRequest,
  type IssuedInvoice,
  type PaymentEvent,
  type PaymentsProvider,
} from './types';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  /** Price ids from env, so prices change without a deploy. */
  prices: Record<CheckoutPlan, string>;
}

/**
 * Stripe Checkout (mode: payment) for one-off job posts. Listing id, company and plan travel in
 * metadata and come back on the webhook. Automatic tax is off until LEGAL_REVIEW C3 is decided.
 */
export class StripePaymentsProvider implements PaymentsProvider {
  readonly name = 'stripe' as const;
  private readonly stripe: Stripe;

  constructor(private readonly config: StripeConfig) {
    this.stripe = new Stripe(config.secretKey);
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: this.config.prices[req.plan], quantity: 1 }],
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      customer_email: req.customerEmail,
      client_reference_id: req.listingId,
      metadata: { listingId: req.listingId, companyId: req.companyId, plan: req.plan },
      payment_intent_data: { metadata: { listingId: req.listingId, plan: req.plan } },
    });
    if (!session.url) throw new Error('Stripe returned no checkout URL');
    return { url: session.url, ref: session.id };
  }

  /**
   * Stripe Invoicing: one customer per company (found by metadata), an invoice item per line,
   * then a finalized invoice sent by email with `days_until_due`. Untested against the live API.
   */
  async createInvoice(req: InvoiceRequest): Promise<IssuedInvoice> {
    if (!req.lines.length) throw new Error('An invoice needs at least one line');
    const found = await this.stripe.customers.search({
      query: `metadata['companyId']:'${req.companyId.replace(/'/g, '')}'`,
      limit: 1,
    });
    const customer =
      found.data[0] ??
      (await this.stripe.customers.create({
        name: req.companyName,
        email: req.billingEmail ?? undefined,
        metadata: { companyId: req.companyId },
      }));
    const invoice = await this.stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: req.dueDays,
      auto_advance: false,
      pending_invoice_items_behavior: 'exclude',
      metadata: { companyId: req.companyId, searchId: req.searchId },
    });
    for (const line of req.lines) {
      await this.stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        amount: line.amountMinor,
        currency: req.currency.toLowerCase(),
        description: line.description,
      });
    }
    const finalized = await this.stripe.invoices.finalizeInvoice(invoice.id!);
    await this.stripe.invoices.sendInvoice(finalized.id!);
    return {
      ref: finalized.id!,
      url: finalized.hosted_invoice_url ?? '',
      totalMinor: finalized.total,
    };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent> {
    const sig = headers.get('stripe-signature');
    if (!sig) throw new WebhookSignatureError('Missing Stripe signature');
    let event: Stripe.Event;
    try {
      event = await this.stripe.webhooks.constructEventAsync(
        rawBody,
        sig,
        this.config.webhookSecret,
      );
    } catch {
      throw new WebhookSignatureError();
    }

    const paid =
      (event.type === 'checkout.session.completed' &&
        event.data.object.payment_status === 'paid') ||
      event.type === 'checkout.session.async_payment_succeeded';
    if (paid) {
      const s = event.data.object as Stripe.Checkout.Session;
      const meta = s.metadata ?? {};
      const currency = (s.currency ?? 'usd').toUpperCase();
      if (
        !meta.listingId ||
        !meta.companyId ||
        (meta.plan !== 'standard' && meta.plan !== 'featured')
      ) {
        return { kind: 'ignored', eventId: event.id, type: event.type, provider: 'stripe' };
      }
      if (!(currencies as readonly string[]).includes(currency))
        throw new Error(`Unsupported currency ${currency}`);
      return {
        kind: 'checkout.completed',
        eventId: event.id,
        ref: s.id,
        listingId: meta.listingId,
        companyId: meta.companyId,
        plan: meta.plan,
        amount: s.amount_total ?? 0,
        currency: currency as Currency,
        customerId: typeof s.customer === 'string' ? s.customer : (s.customer?.id ?? null),
        provider: 'stripe',
      };
    }
    if (event.type === 'invoice.paid') {
      const inv = event.data.object as Stripe.Invoice;
      return {
        kind: 'invoice.paid',
        eventId: event.id,
        ref: inv.id!,
        amountPaid: inv.amount_paid ?? null,
        provider: 'stripe',
      };
    }
    if (event.type === 'checkout.session.expired') {
      const s = event.data.object;
      return {
        kind: 'checkout.expired',
        eventId: event.id,
        ref: s.id,
        listingId: s.metadata?.listingId ?? null,
        provider: 'stripe',
      };
    }
    return { kind: 'ignored', eventId: event.id, type: event.type, provider: 'stripe' };
  }
}
