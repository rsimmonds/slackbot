import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { currencies, subscriptionPlans, type Currency } from '@cmobeat/config';
import { z } from 'zod';
import { FAKE_SIGNATURE_HEADER, signPayload } from './signing';
import type { PaymentEvent, SubscriptionProduct } from './types';

/**
 * Subscriptions for the local fake provider. The TEST checkout and TEST portal pages carry a
 * signed, short-lived token in the URL (there is no pending-checkout table to look up), and send
 * signed events to the same webhook Stripe would call.
 */
export const FAKE_SUBSCRIPTION_CHECKOUT_PATH = '/checkout/fake/subscription';
export const FAKE_PORTAL_PATH = '/billing/portal/fake';

const TOKEN_TTL_MS = 60 * 60 * 1000;
const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64url = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

/** HMAC-signed, expiring token: `<base64url json>.<hex hmac>`. */
export function signFakeToken(payload: object, secret: string, now = Date.now()): string {
  const body = b64url(JSON.stringify({ ...payload, exp: now + TOKEN_TTL_MS }));
  const mac = createHmac('sha256', `fake-token:${secret}`).update(body).digest('hex');
  return `${body}.${mac}`;
}

export function verifyFakeToken<T extends z.ZodTypeAny>(
  token: string,
  schema: T,
  secret: string,
  now = Date.now(),
): z.infer<T> | null {
  const [body, mac] = token.split('.');
  if (!body || !mac || !/^[0-9a-f]{64}$/.test(mac)) return null;
  const expected = createHmac('sha256', `fake-token:${secret}`).update(body).digest();
  const given = Buffer.from(mac, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const json = JSON.parse(unb64url(body)) as { exp?: number };
    if (typeof json.exp !== 'number' || json.exp < now) return null;
    const parsed = schema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const product = z.enum(['employer_subscription', 'candidate_concierge']);

export const fakeCheckoutToken = z.object({
  kind: z.literal('subscription_checkout'),
  ref: z.string().startsWith('fake_cs_sub_'),
  product,
  companyId: z.string().uuid().nullable(),
  userId: z.string().uuid().nullable(),
  seats: z.number().int().min(1).max(100),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});
export type FakeCheckoutToken = z.infer<typeof fakeCheckoutToken>;

export const fakePortalToken = z.object({
  kind: z.literal('portal'),
  subscriptionRef: z.string().startsWith('fake_sub_'),
  customerId: z.string(),
  returnUrl: z.string().url(),
});
export type FakePortalToken = z.infer<typeof fakePortalToken>;

export const fakePriceId = (p: SubscriptionProduct) => `fake_price_${p}`;
export const newFakeSubscriptionRef = () => `fake_sub_${randomBytes(12).toString('hex')}`;
export const fakeCustomerId = (ownerId: string) =>
  `fake_cus_${ownerId.replace(/-/g, '').slice(0, 24)}`;
const eventId = () => `evt_fake_${randomBytes(12).toString('hex')}`;

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

export interface FakeSubscriptionState {
  subscriptionRef: string;
  customerId: string;
  product: SubscriptionProduct;
  companyId: string | null;
  userId: string | null;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete';
  seats: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export function buildFakeSubscriptionUpdated(state: FakeSubscriptionState, secret: string) {
  return signed({ id: eventId(), type: 'customer.subscription.updated', data: state }, secret);
}

export function buildFakeSubscriptionDeleted(subscriptionRef: string, secret: string) {
  return signed(
    { id: eventId(), type: 'customer.subscription.deleted', data: { subscriptionRef } },
    secret,
  );
}

/** The paid invoice for one subscription period (first period or a renewal). */
export function buildFakeSubscriptionInvoicePaid(
  data: { subscriptionRef: string; product: SubscriptionProduct },
  secret: string,
) {
  const plan = subscriptionPlans[data.product];
  return signed(
    {
      id: eventId(),
      type: 'invoice.paid',
      data: {
        ref: `fake_in_${randomBytes(16).toString('hex')}`,
        amountPaid: plan.amount,
        subscriptionRef: data.subscriptionRef,
        currency: plan.currency,
      },
    },
    secret,
  );
}

export function buildFakeInvoicePaymentFailed(subscriptionRef: string, secret: string) {
  return signed(
    {
      id: eventId(),
      type: 'invoice.payment_failed',
      data: { ref: `fake_in_${randomBytes(16).toString('hex')}`, subscriptionRef },
    },
    secret,
  );
}

const updatedEvent = z.object({
  id: z.string().startsWith('evt_fake_'),
  type: z.literal('customer.subscription.updated'),
  data: z.object({
    subscriptionRef: z.string().startsWith('fake_sub_'),
    customerId: z.string().min(1),
    product,
    companyId: z.string().uuid().nullable(),
    userId: z.string().uuid().nullable(),
    status: z.enum(['active', 'past_due', 'canceled', 'incomplete']),
    seats: z.number().int().min(1).max(100),
    currentPeriodEnd: z.string().datetime().nullable(),
    cancelAtPeriodEnd: z.boolean(),
  }),
});
const deletedEvent = z.object({
  id: z.string().startsWith('evt_fake_'),
  type: z.literal('customer.subscription.deleted'),
  data: z.object({ subscriptionRef: z.string().startsWith('fake_sub_') }),
});
const failedEvent = z.object({
  id: z.string().startsWith('evt_fake_'),
  type: z.literal('invoice.payment_failed'),
  data: z.object({
    ref: z.string().startsWith('fake_in_'),
    subscriptionRef: z.string().nullable(),
  }),
});

/** Parse a verified fake subscription event, or null when it is not one of these types. */
export function parseFakeSubscriptionEvent(json: { type?: string }): PaymentEvent | null {
  if (json.type === 'customer.subscription.updated') {
    const e = updatedEvent.parse(json);
    if ((e.data.product === 'employer_subscription') !== !!e.data.companyId)
      throw new Error('Employer subscriptions belong to a company; concierge to a user');
    return {
      kind: 'subscription.updated',
      eventId: e.id,
      subscriptionRef: e.data.subscriptionRef,
      customerId: e.data.customerId,
      priceId: fakePriceId(e.data.product),
      product: e.data.product,
      companyId: e.data.companyId,
      userId: e.data.userId,
      status: e.data.status,
      seats: e.data.seats,
      currentPeriodEnd: e.data.currentPeriodEnd ? new Date(e.data.currentPeriodEnd) : null,
      cancelAtPeriodEnd: e.data.cancelAtPeriodEnd,
      provider: 'fake',
    };
  }
  if (json.type === 'customer.subscription.deleted') {
    const e = deletedEvent.parse(json);
    return {
      kind: 'subscription.deleted',
      eventId: e.id,
      subscriptionRef: e.data.subscriptionRef,
      provider: 'fake',
    };
  }
  if (json.type === 'invoice.payment_failed') {
    const e = failedEvent.parse(json);
    return {
      kind: 'invoice.payment_failed',
      eventId: e.id,
      ref: e.data.ref,
      subscriptionRef: e.data.subscriptionRef,
      provider: 'fake',
    };
  }
  return null;
}

export const isCurrency = (c: unknown): c is Currency =>
  typeof c === 'string' && (currencies as readonly string[]).includes(c);
