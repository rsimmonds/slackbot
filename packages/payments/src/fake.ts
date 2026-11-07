import { createHash, randomBytes } from 'node:crypto';
import { catalogue } from '@cmobeat/config';
import { z } from 'zod';
import { FAKE_SIGNATURE_HEADER, signPayload, verifySignature } from './signing';
import type {
  CheckoutPlan,
  CheckoutRequest,
  CheckoutSession,
  PaymentEvent,
  PaymentsProvider,
} from './types';

/**
 * Local stand-in for Stripe Checkout, used until Stripe keys exist. The app serves a clearly
 * labelled TEST checkout page at /checkout/fake/<ref>; "Pay" posts a signed event to the same
 * webhook route Stripe would use. Refused on production deployments.
 */
export const FAKE_CHECKOUT_PATH = '/checkout/fake';

export function fakePaymentsSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (env.FAKE_PAYMENTS_SECRET) return env.FAKE_PAYMENTS_SECRET;
  if (!env.DEV_AUTH_SECRET)
    throw new Error('Set FAKE_PAYMENTS_SECRET or DEV_AUTH_SECRET for fake payments');
  return createHash('sha256').update(`fake-payments:${env.DEV_AUTH_SECRET}`).digest('hex');
}

const fakeEventSchema = z.object({
  id: z.string().startsWith('evt_fake_'),
  type: z.enum(['checkout.session.completed', 'checkout.session.expired']),
  data: z.object({
    ref: z.string().startsWith('fake_cs_'),
    listingId: z.string().uuid(),
    companyId: z.string().uuid(),
    plan: z.enum(['standard', 'featured']),
  }),
});

export const planAmount = (plan: CheckoutPlan) =>
  plan === 'featured' ? catalogue.job_post_featured.amount : catalogue.job_post_standard.amount;

/** Builds and signs the event the TEST checkout page sends when someone presses Pay or Cancel. */
export function buildFakeEvent(
  data: { ref: string; listingId: string; companyId: string; plan: CheckoutPlan },
  type: 'checkout.session.completed' | 'checkout.session.expired',
  secret: string,
): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify({ id: `evt_fake_${randomBytes(12).toString('hex')}`, type, data });
  return {
    body,
    headers: {
      'content-type': 'application/json',
      [FAKE_SIGNATURE_HEADER]: signPayload(body, secret),
    },
  };
}

export class FakePaymentsProvider implements PaymentsProvider {
  readonly name = 'fake' as const;
  constructor(private readonly secret: string) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const ref = `fake_cs_${randomBytes(16).toString('hex')}`;
    const origin = new URL(req.successUrl).origin;
    return { ref, url: `${origin}${FAKE_CHECKOUT_PATH}/${ref}` };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent> {
    verifySignature(rawBody, headers.get(FAKE_SIGNATURE_HEADER), this.secret);
    const event = fakeEventSchema.parse(JSON.parse(rawBody));
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
