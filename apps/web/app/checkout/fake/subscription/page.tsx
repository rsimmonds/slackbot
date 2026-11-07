import { subscriptionPlans } from '@cmobeat/config';
import { Button, MonoLabel, Status } from '@cmobeat/ui';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { readCheckoutToken } from '@/lib/billing/fake';
import { BillingError } from '@/lib/billing/subscriptions';
import { formatMinor } from '@/lib/searches/terms';
import { resolveTheme } from '@/lib/theme';
import { completeSubscriptionCheckout } from './actions';

export const metadata: Metadata = { title: 'Test checkout', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Stand-in for Stripe Checkout in subscription mode. Clearly a test: no card is taken. */
export default async function FakeSubscriptionCheckout({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t = '' } = await searchParams;
  const viewer = await getViewer();
  if (!viewer)
    redirect(`/sign-in?next=${encodeURIComponent(`/checkout/fake/subscription?t=${t}`)}`);
  let token;
  try {
    token = readCheckoutToken(t);
  } catch (e) {
    if (e instanceof BillingError) notFound();
    throw e;
  }
  const plan = subscriptionPlans[token.product];
  const price = formatMinor(plan.amount, plan.currency);
  const { theme } = await resolveTheme('public');

  return (
    <div data-theme={theme} className="grain flex min-h-dvh items-center justify-center px-4 py-16">
      <main className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <MonoLabel>Checkout</MonoLabel>
          <Status tone="critical">Test mode · no card is charged</Status>
        </div>
        <section className="mesh flex flex-col gap-6 p-8" aria-labelledby="checkout-title">
          <div className="flex flex-col gap-1">
            <h1 id="checkout-title" className="font-serif text-h3 text-text">
              {plan.label}
            </h1>
            <p className="text-small text-text-2">{plan.summary}</p>
          </div>
          <dl className="flex flex-col gap-3 border-y border-line py-4">
            <div className="flex items-baseline justify-between">
              <dt className="label-mono">Billed monthly</dt>
              <dd className="numeric text-h3 text-text">{price}</dd>
            </div>
            {token.product === 'employer_subscription' ? (
              <div className="flex items-baseline justify-between">
                <dt className="label-mono">Seats included</dt>
                <dd className="numeric text-body text-text">{token.seats}</dd>
              </div>
            ) : null}
          </dl>
          <p className="text-micro text-text-3">
            This page stands in for Stripe Checkout until Stripe is connected. Subscribing here
            sends signed test events to the payment webhook.
          </p>
          <div className="flex flex-col gap-3">
            <form action={completeSubscriptionCheckout}>
              <input type="hidden" name="t" value={t} />
              <input type="hidden" name="outcome" value="pay" />
              <Button type="submit" className="w-full">
                Subscribe for {price} / month (test)
              </Button>
            </form>
            <form action={completeSubscriptionCheckout}>
              <input type="hidden" name="t" value={t} />
              <input type="hidden" name="outcome" value="cancel" />
              <Button type="submit" variant="ghost" className="w-full">
                Cancel and return
              </Button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
