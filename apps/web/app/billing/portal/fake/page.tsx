import { subscriptionPlans } from '@cmobeat/config';
import { Button, MonoLabel, Status } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { readPortal } from '@/lib/billing/fake';
import { BillingError } from '@/lib/billing/subscriptions';
import { resolveTheme } from '@/lib/theme';
import { portalAction } from './actions';

export const metadata: Metadata = { title: 'Test billing portal', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Stand-in for the Stripe Billing Portal. Only people who can see the subscription can open it. */
export default async function FakePortalPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; updated?: string }>;
}) {
  const { t = '', updated } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/billing/portal/fake?t=${t}`)}`);
  let portal;
  try {
    portal = await readPortal(viewer, t);
  } catch (e) {
    if (e instanceof BillingError) notFound();
    throw e;
  }
  const { state, token } = portal;
  const plan = subscriptionPlans[state.product];
  const ended = state.status === 'canceled';
  const { theme } = await resolveTheme('public');
  const hidden = <input type="hidden" name="t" value={t} />;

  return (
    <div data-theme={theme} className="grain flex min-h-dvh items-center justify-center px-4 py-16">
      <main className="flex w-full max-w-lg flex-col gap-4">
        <div className="flex items-center justify-between">
          <MonoLabel>Billing portal</MonoLabel>
          <Status tone="critical">Test mode</Status>
        </div>
        <section className="mesh flex flex-col gap-6 p-8" aria-labelledby="portal-title">
          <div className="flex flex-col gap-2">
            <h1 id="portal-title" className="font-serif text-h3 text-text">
              {plan.label}
            </h1>
            <Status tone={ended ? 'neutral' : state.status === 'past_due' ? 'critical' : 'human'}>
              {ended
                ? 'Ended'
                : state.status === 'past_due'
                  ? 'Payment failed · retrying'
                  : state.cancelAtPeriodEnd
                    ? 'Cancels at period end'
                    : 'Active'}
            </Status>
            {updated ? (
              <p role="status" className="text-small text-text-2">
                Updated.
              </p>
            ) : null}
          </div>
          {!ended && state.product === 'employer_subscription' ? (
            <form action={portalAction} className="flex items-end gap-3">
              {hidden}
              <input type="hidden" name="intent" value="seats" />
              <label className="flex flex-col gap-2">
                <span className="label-mono">Seats</span>
                <input
                  type="number"
                  name="seats"
                  min={1}
                  max={plan.maxSeats}
                  defaultValue={state.seats}
                  className="h-10 w-24 rounded-control border border-line bg-surface px-3 text-small text-text"
                />
              </label>
              <Button type="submit" variant="secondary" size="sm">
                Update seats
              </Button>
            </form>
          ) : null}
          {!ended ? (
            <form action={portalAction} className="flex flex-wrap gap-3">
              {hidden}
              {state.cancelAtPeriodEnd ? (
                <Button type="submit" name="intent" value="resume" variant="human" size="sm">
                  Keep my subscription
                </Button>
              ) : (
                <Button type="submit" name="intent" value="cancel" variant="secondary" size="sm">
                  Cancel at period end
                </Button>
              )}
            </form>
          ) : null}
          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <MonoLabel>Test controls</MonoLabel>
            <form action={portalAction} className="flex flex-wrap gap-3">
              {hidden}
              <Button type="submit" name="intent" value="renew" variant="ghost" size="sm">
                Simulate a renewal
              </Button>
              {!ended ? (
                <Button type="submit" name="intent" value="fail_payment" variant="ghost" size="sm">
                  Simulate a failed payment
                </Button>
              ) : null}
              {!ended ? (
                <Button type="submit" name="intent" value="end" variant="danger" size="sm">
                  End now
                </Button>
              ) : null}
            </form>
          </div>
          <Link
            href={token.returnUrl}
            className="text-small text-text-2 underline underline-offset-4 hover:text-text"
          >
            Return to{' '}
            {new URL(token.returnUrl).pathname.startsWith('/me') ? 'concierge' : 'billing'}
          </Link>
        </section>
      </main>
    </div>
  );
}
