import { createHash, randomBytes } from 'node:crypto';
import { catalogue } from '@cmobeat/config';
import { z } from 'zod';
import { FAKE_SIGNATURE_HEADER, signPayload, verifySignature } from './signing';
import {
  FAKE_PORTAL_PATH,
  FAKE_SUBSCRIPTION_CHECKOUT_PATH,
  isCurrency,
  parseFakeSubscriptionEvent,
  signFakeToken,
} from './fake-subscriptions';
import type {
  CheckoutPlan,
  CheckoutRequest,
  CheckoutSession,
  InvoiceRequest,
  IssuedInvoice,
  PaymentEvent,
  PaymentsProvider,
  PortalRequest,
  SubscriptionCheckoutRequest,
} from './types';

/**
 * Local stand-in for Stripe, used until Stripe keys exist.
 * - Checkout: a clearly labelled TEST page at /checkout/fake/<ref>; "Pay" posts a signed event to
 *   the same webhook route Stripe would use.
 * - Invoices: a TEST invoice page at /billing/invoices/<ref>; staff "Mark paid (test)" posts a
 *   signed invoice.paid event to the same webhook.
 * Refused on production deployments.
 */
export const FAKE_CHECKOUT_PATH = '/checkout/fake';
export const FAKE_INVOICE_PATH = '/billing/invoices';

export function fakePaymentsSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (env.FAKE_PAYMENTS_SECRET) return env.FAKE_PAYMENTS_SECRET;
  if (!env.DEV_AUTH_SECRET)
    throw new Error('Set FAKE_PAYMENTS_SECRET or DEV_AUTH_SECRET for fake payments');
  return createHash('sha256').update(`fake-payments:${env.DEV_AUTH_SECRET}`).digest('hex');
}

const fakeCheckoutEvent = z.object({
  id: z.string().startsWith('evt_fake_'),
  type: z.enum(['checkout.session.completed', 'checkout.session.expired']),
  data: z.object({
    ref: z.string().startsWith('fake_cs_'),
    listingId: z.string().uuid(),
    companyId: z.string().uuid(),
    plan: z.enum(['standard', 'featured']),
  }),
});

const fakeInvoiceEvent = z.object({
  id: z.string().startsWith('evt_fake_'),
  type: z.literal('invoice.paid'),
  data: z.object({
    ref: z.string().startsWith('fake_in_'),
    amountPaid: z.number().int().nonnegative(),
    subscriptionRef: z.string().startsWith('fake_sub_').nullish(),
    currency: z.string().nullish(),
  }),
});

export const planAmount = (plan: CheckoutPlan) =>
  plan === 'featured' ? catalogue.job_post_featured.amount : catalogue.job_post_standard.amount;

const signed = (payload: unknown, secret: string) => {
  const body = JSON.stringify(payload);
  return {
    body,
    headers: {
      'content-type': 'application/json',
      [FAKE_SIGNATURE_HEADER]: signPayload(body, secret),
    },
  };
};
const eventId = () => `evt_fake_${randomBytes(12).toString('hex')}`;

/** Builds and signs the event the TEST checkout page sends when someone presses Pay or Cancel. */
export function buildFakeEvent(
  data: { ref: string; listingId: string; companyId: string; plan: CheckoutPlan },
  type: 'checkout.session.completed' | 'checkout.session.expired',
  secret: string,
): { body: string; headers: Record<string, string> } {
  return signed({ id: eventId(), type, data }, secret);
}

/** Builds and signs the event staff send with "Mark paid (test)" on a TEST invoice. */
export function buildFakeInvoicePaidEvent(
  data: { ref: string; amountPaid: number },
  secret: string,
): { body: string; headers: Record<string, string> } {
  return signed({ id: eventId(), type: 'invoice.paid', data }, secret);
}

export class FakePaymentsProvider implements PaymentsProvider {
  readonly name = 'fake' as const;
  constructor(private readonly secret: string) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const ref = `fake_cs_${randomBytes(16).toString('hex')}`;
    const origin = new URL(req.successUrl).origin;
    return { ref, url: `${origin}${FAKE_CHECKOUT_PATH}/${ref}` };
  }

  async createInvoice(req: InvoiceRequest): Promise<IssuedInvoice> {
    if (!req.lines.length) throw new Error('An invoice needs at least one line');
    const totalMinor = req.lines.reduce((sum, l) => {
      if (!Number.isSafeInteger(l.amountMinor) || l.amountMinor < 0)
        throw new Error('Invoice line amounts must be whole minor units');
      return sum + l.amountMinor;
    }, 0);
    const ref = `fake_in_${randomBytes(16).toString('hex')}`;
    const origin = new URL(req.appOrigin).origin;
    return { ref, url: `${origin}${FAKE_INVOICE_PATH}/${ref}`, totalMinor };
  }

  async createSubscriptionCheckout(req: SubscriptionCheckoutRequest): Promise<CheckoutSession> {
    if (
      (req.product === 'employer_subscription') !== !!req.companyId ||
      (!req.companyId && !req.userId)
    )
      throw new Error('Employer subscriptions need a company; concierge needs a user');
    const ref = `fake_cs_sub_${randomBytes(16).toString('hex')}`;
    const token = signFakeToken(
      {
        kind: 'subscription_checkout',
        ref,
        product: req.product,
        companyId: req.companyId ?? null,
        userId: req.companyId ? null : (req.userId ?? null),
        seats: req.seats,
        successUrl: req.successUrl,
        cancelUrl: req.cancelUrl,
      },
      this.secret,
    );
    const origin = new URL(req.successUrl).origin;
    return {
      ref,
      url: `${origin}${FAKE_SUBSCRIPTION_CHECKOUT_PATH}?t=${encodeURIComponent(token)}`,
    };
  }

  async createPortalSession(req: PortalRequest): Promise<{ url: string }> {
    const token = signFakeToken(
      {
        kind: 'portal',
        subscriptionRef: req.subscriptionRef,
        customerId: req.customerId,
        returnUrl: req.returnUrl,
      },
      this.secret,
    );
    const origin = new URL(req.returnUrl).origin;
    return { url: `${origin}${FAKE_PORTAL_PATH}?t=${encodeURIComponent(token)}` };
  }

  /** The fake provider changes subscriptions only through its TEST portal page. */
  async setCancelAtPeriodEnd(): Promise<boolean> {
    return false;
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent> {
    verifySignature(rawBody, headers.get(FAKE_SIGNATURE_HEADER), this.secret);
    const json = JSON.parse(rawBody) as { type?: string };
    const sub = parseFakeSubscriptionEvent(json);
    if (sub) return sub;
    if (json.type === 'invoice.paid') {
      const event = fakeInvoiceEvent.parse(json);
      return {
        kind: 'invoice.paid',
        eventId: event.id,
        ref: event.data.ref,
        amountPaid: event.data.amountPaid,
        subscriptionRef: event.data.subscriptionRef ?? null,
        currency: isCurrency(event.data.currency) ? event.data.currency : null,
        provider: 'fake',
      };
    }
    const event = fakeCheckoutEvent.parse(json);
    if (event.type === 'checkout.session.expired') {
      return {
        kind: 'checkout.expired',
        eventId: event.id,
        ref: event.data.ref,
        listingId: event.data.listingId,
        provider: 'fake',
      };
    }
    return {
      kind: 'checkout.completed',
      eventId: event.id,
      ref: event.data.ref,
      listingId: event.data.listingId,
      companyId: event.data.companyId,
      plan: event.data.plan,
      amount: planAmount(event.data.plan),
      currency: 'USD',
      customerId: null,
      provider: 'fake',
    };
  }
}
