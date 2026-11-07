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
  type PortalRequest,
  type SubscriptionCheckoutRequest,
  type SubscriptionProduct,
} from './types';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  /** Price ids from env, so prices change without a deploy. */
  prices: Record<CheckoutPlan, string>;
  /** Monthly subscription price ids (Phase 4). Optional until the products exist in Stripe. */
  subscriptionPrices?: Partial<Record<SubscriptionProduct, string>>;
}

const isProduct = (p: unknown): p is SubscriptionProduct =>
  p === 'employer_subscription' || p === 'candidate_concierge';

/** Reads fields that moved between Stripe API versions (period end, invoice → subscription). */
type Loose = Record<string, unknown> & { [k: string]: unknown };
const get = (o: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Loose)[k] : undefined), o);
const idOf = (v: unknown): string | null =>
  typeof v === 'string' ? v : typeof get(v, 'id') === 'string' ? (get(v, 'id') as string) : null;

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

  /** Stripe Checkout in subscription mode. Untested against the live API. */
  async createSubscriptionCheckout(req: SubscriptionCheckoutRequest): Promise<CheckoutSession> {
    const price = this.config.subscriptionPrices?.[req.product];
    if (!price) throw new Error(`No Stripe price configured for ${req.product}`);
    const metadata = {
      product: req.product,
      companyId: req.companyId ?? '',
      userId: req.userId ?? '',
      seats: String(req.seats),
    };
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      customer_email: req.customerEmail,
      client_reference_id: req.companyId ?? req.userId ?? undefined,
      metadata,
      subscription_data: { metadata },
    });
    if (!session.url) throw new Error('Stripe returned no checkout URL');
    return { url: session.url, ref: session.id };
  }

  /** Stripe Billing Portal: seats, cancellation and payment method. Untested against the live API. */
  async createPortalSession(req: PortalRequest): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: req.customerId,
      return_url: req.returnUrl,
    });
    return { url: session.url };
  }

  async setCancelAtPeriodEnd(subscriptionRef: string, cancel: boolean): Promise<boolean> {
    await this.stripe.subscriptions.update(subscriptionRef, { cancel_at_period_end: cancel });
    return true;
  }

  private subscriptionEvent(event: Stripe.Event): PaymentEvent {
    const sub = event.data.object as unknown as Loose;
    const meta = (get(sub, 'metadata') ?? {}) as Record<string, string>;
    if (!isProduct(meta.product))
      return { kind: 'ignored', eventId: event.id, type: event.type, provider: 'stripe' };
    const subscriptionRef = idOf(sub)!;
    if (event.type === 'customer.subscription.deleted')
      return {
        kind: 'subscription.deleted',
        eventId: event.id,
        subscriptionRef,
        provider: 'stripe',
      };
    const item = get(sub, 'items', 'data', '0');
    const periodEnd = (get(sub, 'current_period_end') ?? get(item, 'current_period_end')) as
      number | undefined;
    const seats = Number(meta.seats) || 1;
    return {
      kind: 'subscription.updated',
      eventId: event.id,
      subscriptionRef,
      customerId: idOf(get(sub, 'customer')) ?? '',
      priceId: idOf(get(item, 'price')) ?? '',
      product: meta.product,
      companyId: meta.companyId || null,
      userId: meta.userId || null,
      status: String(get(sub, 'status') ?? 'incomplete'),
      seats,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: get(sub, 'cancel_at_period_end') === true,
      provider: 'stripe',
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
    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      return this.subscriptionEvent(event);
    }
    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const inv = event.data.object as Stripe.Invoice;
      const subscriptionRef =
        idOf(get(inv, 'subscription')) ??
        idOf(get(inv, 'parent', 'subscription_details', 'subscription'));
      if (event.type === 'invoice.payment_failed') {
        return {
          kind: 'invoice.payment_failed',
          eventId: event.id,
          ref: inv.id!,
          subscriptionRef,
          provider: 'stripe',
        };
      }
      const currency = (inv.currency ?? '').toUpperCase();
      return {
        kind: 'invoice.paid',
        eventId: event.id,
        ref: inv.id!,
        amountPaid: inv.amount_paid ?? null,
        subscriptionRef,
        currency: (currencies as readonly string[]).includes(currency)
          ? (currency as Currency)
          : null,
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
