import { feeMinor, searchFeeTerms } from '@cmobeat/config';
import {
  FakePaymentsProvider,
  buildFakeEvent,
  buildFakeInvoicePaidEvent,
  paymentsProvider,
} from './index';
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

describe('fake invoices', () => {
  const provider = new FakePaymentsProvider(secret);
  const req = {
    companyId: ids.companyId,
    companyName: 'Sample Co',
    billingEmail: 'billing@sample.example',
    searchId: ids.listingId,
    currency: 'EUR' as const,
    dueDays: 30,
    appOrigin: 'http://localhost:3000',
  };

  it('issues an invoice with a local TEST page and the summed total', async () => {
    const inv = await provider.createInvoice({
      ...req,
      lines: [
        { description: 'Success fee', amountMinor: 4_800_000 },
        { description: 'Adjustment', amountMinor: 1 },
      ],
    });
    expect(inv.ref).toMatch(/^fake_in_[0-9a-f]{32}$/);
    expect(inv.url).toBe(`http://localhost:3000/billing/invoices/${inv.ref}`);
    expect(inv.totalMinor).toBe(4_800_001);
  });

  it('refuses empty or fractional lines', async () => {
    await expect(provider.createInvoice({ ...req, lines: [] })).rejects.toThrow();
    await expect(
      provider.createInvoice({ ...req, lines: [{ description: 'x', amountMinor: 1.5 }] }),
    ).rejects.toThrow();
  });

  it('round-trips a signed invoice.paid event and rejects a forged one', async () => {
    const ref = `fake_in_${'a'.repeat(32)}`;
    const { body, headers } = buildFakeInvoicePaidEvent({ ref, amountPaid: 123 }, secret);
    const event = await provider.parseWebhook(body, new Headers(headers));
    expect(event).toMatchObject({ kind: 'invoice.paid', ref, amountPaid: 123, provider: 'fake' });
    const forged = buildFakeInvoicePaidEvent({ ref, amountPaid: 1 }, 'x'.repeat(64));
    await expect(provider.parseWebhook(forged.body, new Headers(forged.headers))).rejects.toThrow(
      WebhookSignatureError,
    );
  });
});

describe('search fee maths', () => {
  it('computes fees in minor units with integer maths', () => {
    // 12% of $400,000 first-year cash comp = $48,000.00
    expect(feeMinor(400_000, searchFeeTerms.ai_search.rateBps)).toBe(4_800_000);
    // 15% of a €14,000 monthly retainer = €2,100.00
    expect(feeMinor(14_000, searchFeeTerms.fractional_match.rateBps)).toBe(210_000);
    expect(feeMinor(333_333, 1200)).toBe(3_999_996);
  });

  it('rounds half up to the nearest minor unit for fractional basis points', () => {
    expect(feeMinor(1, 1250)).toBe(13); // 12.5 cents rounds up to 13
    expect(feeMinor(1, 1249)).toBe(12); // 12.49 cents rounds down to 12
    expect(feeMinor(3, 1)).toBe(0); // 0.03 cents rounds to 0
  });

  it('rejects non-integer or negative amounts and rates', () => {
    expect(() => feeMinor(1.5, 1200)).toThrow();
    expect(() => feeMinor(-1, 1200)).toThrow();
    expect(() => feeMinor(1, 12.5)).toThrow();
  });
});
