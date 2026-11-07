import { catalogue } from '@cmobeat/config';
import { listings, mandates } from '@cmobeat/db';
import { paymentsProvider, planAmount } from '@cmobeat/payments';
import { Button, MonoLabel, Status } from '@cmobeat/ui';
import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { resolveTheme } from '@/lib/theme';
import { completeFakeCheckout } from './actions';

export const metadata: Metadata = { title: 'Test checkout', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Stand-in for Stripe's hosted checkout. Clearly a test: no card is taken. */
export default async function FakeCheckoutPage({ params }: { params: Promise<{ ref: string }> }) {
  if (paymentsProvider().name !== 'fake') notFound();
  const { ref } = await params;
  if (!/^fake_cs_[0-9a-f]{32}$/.test(ref)) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/checkout/fake/${ref}`)}`);

  const row = await asViewer(viewer, async (tx) => {
    const [r] = await tx
      .select({ id: listings.id, plan: listings.plan, title: mandates.title })
      .from(listings)
      .innerJoin(mandates, eq(mandates.id, listings.mandateId))
      .where(and(eq(listings.checkoutRef, ref), eq(listings.status, 'pending_payment')))
      .limit(1);
    return r;
  });
  if (!row || (row.plan !== 'standard' && row.plan !== 'featured')) notFound();
  const product =
    row.plan === 'featured' ? catalogue.job_post_featured : catalogue.job_post_standard;
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    planAmount(row.plan) / 100,
  );
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
              {product.label}
            </h1>
            <p className="text-small text-text-2">{row.title} · 60 days</p>
          </div>
          <dl className="flex items-baseline justify-between border-y border-line py-4">
            <dt className="label-mono">Total due</dt>
            <dd className="numeric text-h3 text-text">{amount}</dd>
          </dl>
          <p className="text-micro text-text-3">
            This page stands in for Stripe Checkout until Stripe is connected. Paying here sends a
            signed test event to the payment webhook.
          </p>
          <div className="flex flex-col gap-3">
            <form action={completeFakeCheckout}>
              <input type="hidden" name="ref" value={ref} />
              <input type="hidden" name="outcome" value="pay" />
              <Button type="submit" className="w-full">
                Pay {amount} (test)
              </Button>
            </form>
            <form action={completeFakeCheckout}>
              <input type="hidden" name="ref" value={ref} />
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
