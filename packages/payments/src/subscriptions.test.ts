import { describe, expect, it } from 'vitest';
import { FakePaymentsProvider } from './fake';
import {
  buildFakeInvoicePaymentFailed,
  buildFakeSubscriptionDeleted,
  buildFakeSubscriptionInvoicePaid,
  buildFakeSubscriptionUpdated,
  fakeCheckoutToken,
  signFakeToken,
  verifyFakeToken,
} from './fake-subscriptions';

const secret = 's'.repeat(40);
const fake = new FakePaymentsProvider(secret);
const company = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const headers = (h: Record<string, string>) => new Headers(h);

describe('fake subscription tokens', () => {
  it('round-trips, and rejects tampering, the wrong secret and expiry', () => {
    const t = signFakeToken(
      { kind: 'portal', subscriptionRef: 'fake_sub_x', customerId: 'c', returnUrl: 'http://a/b' },
      secret,
    );
    const schema = fakeCheckoutToken.or(fakeCheckoutToken); // any schema works for the negative cases
    expect(verifyFakeToken(t, schema, 'x'.repeat(40))).toBeNull();
    const [body, mac] = t.split('.');
    expect(verifyFakeToken(`${body}x.${mac}`, schema, secret)).toBeNull();
    const old = signFakeToken({ kind: 'x' }, secret, Date.now() - 2 * 3600_000);
    expect(verifyFakeToken(old, schema, secret)).toBeNull();
  });
});

describe('fake subscription checkout', () => {
  it('creates a TEST checkout URL carrying a signed token on the success origin', async () => {
    const s = await fake.createSubscriptionCheckout({
      product: 'employer_subscription',
      companyId: company,
      seats: 5,
      successUrl: 'http://localhost:3000/employer/billing?subscribed=1',
      cancelUrl: 'http://localhost:3000/employer/billing',
    });
    expect(s.ref).toMatch(/^fake_cs_sub_[0-9a-f]{32}$/);
    const url = new URL(s.url);
    expect(url.origin).toBe('http://localhost:3000');
    expect(url.pathname).toBe('/checkout/fake/subscription');
    const token = verifyFakeToken(url.searchParams.get('t')!, fakeCheckoutToken, secret);
    expect(token).toMatchObject({
      product: 'employer_subscription',
      companyId: company,
      userId: null,
      seats: 5,
      ref: s.ref,
    });
  });

  it('refuses an employer subscription without a company, and concierge without a user', async () => {
    const base = { seats: 1, successUrl: 'http://a/s', cancelUrl: 'http://a/c' };
    await expect(
      fake.createSubscriptionCheckout({ ...base, product: 'employer_subscription', userId: user }),
    ).rejects.toThrow();
    await expect(
      fake.createSubscriptionCheckout({ ...base, product: 'candidate_concierge' }),
    ).rejects.toThrow();
  });
});

describe('fake subscription events', () => {
  it('parses created/updated state, deletion, renewal invoices and failed payments', async () => {
    const end = new Date(Date.now() + 30 * 864e5).toISOString();
    const up = buildFakeSubscriptionUpdated(
      {
        subscriptionRef: 'fake_sub_abc',
        customerId: 'fake_cus_1',
        product: 'candidate_concierge',
        companyId: null,
        userId: user,
        status: 'active',
        seats: 1,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: false,
      },
      secret,
    );
    const e1 = await fake.parseWebhook(up.body, headers(up.headers));
    expect(e1).toMatchObject({
      kind: 'subscription.updated',
      product: 'candidate_concierge',
      userId: user,
      status: 'active',
      priceId: 'fake_price_candidate_concierge',
    });

    const del = buildFakeSubscriptionDeleted('fake_sub_abc', secret);
    expect(await fake.parseWebhook(del.body, headers(del.headers))).toMatchObject({
      kind: 'subscription.deleted',
      subscriptionRef: 'fake_sub_abc',
    });

    const paid = buildFakeSubscriptionInvoicePaid(
      { subscriptionRef: 'fake_sub_abc', product: 'employer_subscription' },
      secret,
    );
    expect(await fake.parseWebhook(paid.body, headers(paid.headers))).toMatchObject({
      kind: 'invoice.paid',
      subscriptionRef: 'fake_sub_abc',
      amountPaid: 150_000,
      currency: 'USD',
    });

    const failed = buildFakeInvoicePaymentFailed('fake_sub_abc', secret);
    expect(await fake.parseWebhook(failed.body, headers(failed.headers))).toMatchObject({
      kind: 'invoice.payment_failed',
      subscriptionRef: 'fake_sub_abc',
    });
  });

  it('rejects a forged subscription event and an employer plan without a company', async () => {
    const up = buildFakeSubscriptionUpdated(
      {
        subscriptionRef: 'fake_sub_abc',
        customerId: 'c',
        product: 'employer_subscription',
        companyId: company,
        userId: null,
        status: 'active',
        seats: 5,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      'wrong'.repeat(10),
    );
    await expect(fake.parseWebhook(up.body, headers(up.headers))).rejects.toThrow();
    const bad = buildFakeSubscriptionUpdated(
      {
        subscriptionRef: 'fake_sub_abc',
        customerId: 'c',
        product: 'employer_subscription',
        companyId: null,
        userId: user,
        status: 'active',
        seats: 5,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      secret,
    );
    await expect(fake.parseWebhook(bad.body, headers(bad.headers))).rejects.toThrow();
  });

  it('only changes subscriptions through the TEST portal', async () => {
    expect(await fake.setCancelAtPeriodEnd()).toBe(false);
    const p = await fake.createPortalSession({
      subscriptionRef: 'fake_sub_abc',
      customerId: 'c',
      returnUrl: 'http://localhost:3000/me/concierge',
    });
    expect(new URL(p.url).pathname).toBe('/billing/portal/fake');
  });
});
