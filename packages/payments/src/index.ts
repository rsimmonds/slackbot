import { FakePaymentsProvider, fakePaymentsSecret } from './fake';
import { StripePaymentsProvider } from './stripe';
import type { PaymentsProvider } from './types';

export * from './types';
export {
  FakePaymentsProvider,
  buildFakeEvent,
  fakePaymentsSecret,
  planAmount,
  FAKE_CHECKOUT_PATH,
} from './fake';
export { StripePaymentsProvider } from './stripe';

/**
 * PAYMENTS_PROVIDER=stripe|fake. Defaults to stripe when STRIPE_SECRET_KEY is set, else fake.
 * The fake provider is refused on a production deployment.
 */
export function paymentsProvider(env: NodeJS.ProcessEnv = process.env): PaymentsProvider {
  const choice = env.PAYMENTS_PROVIDER || (env.STRIPE_SECRET_KEY ? 'stripe' : 'fake');
  if (choice === 'stripe') {
    const missing = [
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PRICE_JOB_POST_STANDARD',
      'STRIPE_PRICE_JOB_POST_FEATURED',
    ].filter((k) => !env[k]);
    if (missing.length) throw new Error(`Stripe is missing: ${missing.join(', ')}`);
    return new StripePaymentsProvider({
      secretKey: env.STRIPE_SECRET_KEY!,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET!,
      prices: {
        standard: env.STRIPE_PRICE_JOB_POST_STANDARD!,
        featured: env.STRIPE_PRICE_JOB_POST_FEATURED!,
      },
    });
  }
  if (choice !== 'fake') throw new Error(`Unknown PAYMENTS_PROVIDER ${choice}`);
  if (env.VERCEL_ENV === 'production')
    throw new Error('The fake payments provider can never run in production.');
  return new FakePaymentsProvider(fakePaymentsSecret(env));
}
