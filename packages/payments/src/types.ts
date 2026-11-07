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
  | { kind: 'ignored'; eventId: string; type: string; provider: 'stripe' | 'fake' };

export interface PaymentsProvider {
  readonly name: 'stripe' | 'fake';
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Verifies the signature and returns the normalised event. Throws WebhookSignatureError. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent>;
}

export class WebhookSignatureError extends Error {
  constructor(message = 'Invalid webhook signature') {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}
