import { FakePaymentsProvider, buildFakeEvent, paymentsProvider } from './index';
import { signPayload, verifySignature } from './signing';
import { WebhookSignatureError } from './types';

const secret = 's'.repeat(64);
const ids = {
  listingId: '11111111-1111-4111-8111-111111111111',
  companyId: '22222222-2222-4222-8222-222222222222',
};

describe('signing', () => {
  it('verifies its own signature and rejects tampering, wrong secrets and old timestamps', () => {
    const body = '{"a":1}';
    const header = signPayload(body, secret);
    expect(() => verifySignature(body, header, secret)).not.toThrow();
    expect(() => verifySignature('{"a":2}', header, secret)).toThrow(WebhookSignatureError);
    expect(() => verifySignature(body, header, 'x'.repeat(64))).toThrow(WebhookSignatureError);
    const old = signPayload(body, secret, Date.now() - 10 * 60_000);
    expect(() => verifySignature(body, old, secret)).toThrow(/too old/);
    expect(() => verifySignature(body, null, secret)).toThrow(/Missing/);
  });
});

describe('fake provider', () => {
  const provider = new FakePaymentsProvider(secret);

  it('creates a local TEST checkout on the same origin as the success URL', async () => {
    const s = await provider.createCheckout({
      ...ids,
      plan: 'standard',
      successUrl: 'http://localhost:3000/employer/jobs?paid=1',
      cancelUrl: 'http://localhost:3000/x',
    });
    expect(s.ref).toMatch(/^fake_cs_/);
    expect(s.url).toBe(`http://localhost:3000/checkout/fake/${s.ref}`);
  });

  it('parses a signed completed event, pricing it server-side from the catalogue', async () => {
    const { body, headers } = buildFakeEvent(
      { ref: 'fake_cs_abc', ...ids, plan: 'featured' },
      'checkout.session.completed',
      secret,
    );
    const e = await provider.parseWebhook(body, new Headers(headers));
    expect(e).toMatchObject({
      kind: 'checkout.completed',
      plan: 'featured',
      amount: 150_000,
      currency: 'USD',
      listingId: ids.listingId,
    });
  });

  it('rejects an unsigned or forged event', async () => {
    const { body } = buildFakeEvent(
      { ref: 'fake_cs_abc', ...ids, plan: 'standard' },
      'checkout.session.completed',
      secret,
    );
    await expect(provider.parseWebhook(body, new Headers())).rejects.toThrow(WebhookSignatureError);
    const forged = buildFakeEvent(
      { ref: 'fake_cs_abc', ...ids, plan: 'standard' },
      'checkout.session.completed',
      'x'.repeat(64),
    );
    await expect(provider.parseWebhook(forged.body, new Headers(forged.headers))).rejects.toThrow(
      WebhookSignatureError,
    );
  });
});

describe('provider selection', () => {
  it('defaults to fake without Stripe keys, refuses fake in production, and needs all Stripe settings', () => {
    expect(paymentsProvider({ DEV_AUTH_SECRET: secret } as NodeJS.ProcessEnv).name).toBe('fake');
    expect(() =>
      paymentsProvider({ DEV_AUTH_SECRET: secret, VERCEL_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/production/);
    expect(() => paymentsProvider({ STRIPE_SECRET_KEY: 'sk_test_x' } as NodeJS.ProcessEnv)).toThrow(
      /STRIPE_WEBHOOK_SECRET/,
    );
    expect(
      paymentsProvider({
        STRIPE_SECRET_KEY: 'sk_test_x',
        STRIPE_WEBHOOK_SECRET: 'whsec_x',
        STRIPE_PRICE_JOB_POST_STANDARD: 'price_a',
        STRIPE_PRICE_JOB_POST_FEATURED: 'price_b',
      } as NodeJS.ProcessEnv).name,
    ).toBe('stripe');
  });
});
