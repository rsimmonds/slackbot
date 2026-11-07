import type { Currency } from '@cmobeat/config';

/** Job-post plans that go through checkout. Subscription posts are billed separately (Phase 4). */
export type CheckoutPlan = 'standard' | 'featured';

export interface CheckoutRequest {
  listingId: string;
  companyId: string;
  plan: CheckoutPlan;
  /** Employer's email, prefilled on the hosted checkout. */
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  /** Hosted checkout page to send the employer to. */
  url: string;
  /** Provider reference, stored on listings.checkout_ref. */
  ref: string;
}

/**
 * A verified provider event, normalised. `completed` means money was taken.
 * Everything else the app does not act on is `ignored`.
 */
export type PaymentEvent =
  | {
      kind: 'checkout.completed';
      /** Provider event id. Used for idempotency (payments.stripe_ref). */
      eventId: string;
      ref: string;
      listingId: string;
      companyId: string;
      plan: CheckoutPlan;
      /** Minor units (cents). */
      amount: number;
      currency: Currency;
      customerId: string | null;
      provider: 'stripe' | 'fake';
    }
  | {
      kind: 'checkout.expired';
      eventId: string;
      ref: string;
      listingId: string | null;
      provider: 'stripe' | 'fake';
    }
  | {
      kind: 'invoice.paid';
      eventId: string;
      /** Provider invoice reference, stored on payments.stripe_ref. */
      ref: string;
      /** Minor units actually paid, when the provider reports it. */
      amountPaid: number | null;
      /** Set when the invoice belongs to a subscription (a renewal or the first period). */
      subscriptionRef?: string | null;
      currency?: Currency | null;
      provider: 'stripe' | 'fake';
    }
  | {
      /** Created or updated: the full current state of the subscription (state-based, idempotent). */
      kind: 'subscription.updated';
      eventId: string;
      subscriptionRef: string;
      customerId: string;
      priceId: string;
      product: SubscriptionProduct;
      companyId: string | null;
      userId: string | null;
      status: string;
      seats: number;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
      provider: 'stripe' | 'fake';
    }
  | {
      kind: 'subscription.deleted';
      eventId: string;
      subscriptionRef: string;
      provider: 'stripe' | 'fake';
    }
  | {
      kind: 'invoice.payment_failed';
      eventId: string;
      ref: string;
      subscriptionRef: string | null;
      provider: 'stripe' | 'fake';
    }
  | { kind: 'ignored'; eventId: string; type: string; provider: 'stripe' | 'fake' };

/** Subscriptions (Phase 4): employer plan and candidate concierge. */
export type SubscriptionProduct = 'employer_subscription' | 'candidate_concierge';

export interface SubscriptionCheckoutRequest {
  product: SubscriptionProduct;
  /** Employer subscriptions belong to a company; concierge to a user. Exactly one is set. */
  companyId?: string | null;
  userId?: string | null;
  seats: number;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface PortalRequest {
  subscriptionRef: string;
  customerId: string;
  returnUrl: string;
}

export interface InvoiceLine {
  description: string;
  /** Minor units (cents). */
  amountMinor: number;
}

export interface InvoiceRequest {
  companyId: string;
  companyName: string;
  /** Billing email for the company (Stripe sends the invoice there). */
  billingEmail: string | null;
  searchId: string;
  lines: InvoiceLine[];
  currency: Currency;
  dueDays: number;
  /** App origin, for the hosted invoice page of the fake provider. */
  appOrigin: string;
}

export interface IssuedInvoice {
  /** Provider reference (Stripe invoice id or fake_in_…). */
  ref: string;
  /** Where the employer can view or pay it. */
  url: string;
  totalMinor: number;
}

export interface PaymentsProvider {
  readonly name: 'stripe' | 'fake';
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Issue and send an invoice (search success fees, fractional retainer fees). */
  createInvoice(req: InvoiceRequest): Promise<IssuedInvoice>;
  /** Hosted checkout for a monthly subscription. */
  createSubscriptionCheckout(req: SubscriptionCheckoutRequest): Promise<CheckoutSession>;
  /** Hosted page where the customer manages seats, cancellation and payment details. */
  createPortalSession(req: PortalRequest): Promise<{ url: string }>;
  /**
   * Cancel at the end of the current period, or resume. The provider's webhook then updates our
   * copy; nothing here writes the database. Returns false when the change must be made on the
   * hosted portal instead (the fake provider).
   */
  setCancelAtPeriodEnd(subscriptionRef: string, cancel: boolean): Promise<boolean>;
  /** Verifies the signature and returns the normalised event. Throws WebhookSignatureError. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent>;
}

export class WebhookSignatureError extends Error {
  constructor(message = 'Invalid webhook signature') {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}
