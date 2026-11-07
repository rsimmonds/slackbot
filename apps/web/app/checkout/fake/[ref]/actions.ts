'use server';

import { listings, mandates } from '@cmobeat/db';
import { buildFakeEvent, fakePaymentsSecret, paymentsProvider } from '@cmobeat/payments';
import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { appOrigin } from '@/lib/origin';

/**
 * The TEST checkout's Pay / Cancel buttons. Sends a signed event to the real webhook route, exactly
 * as Stripe would, so the same verification and idempotency code runs. Fake provider only.
 */
export async function completeFakeCheckout(formData: FormData) {
  if (paymentsProvider().name !== 'fake') throw new Error('Fake checkout is disabled.');
  const ref = String(formData.get('ref') ?? '');
  const outcome = formData.get('outcome') === 'pay' ? 'pay' : 'cancel';
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');

  const row = await asViewer(viewer, async (tx) => {
    const [r] = await tx
      .select({ id: listings.id, companyId: listings.companyId, plan: listings.plan })
      .from(listings)
      .innerJoin(mandates, eq(mandates.id, listings.mandateId))
      .where(and(eq(listings.checkoutRef, ref), eq(listings.status, 'pending_payment')))
      .limit(1);
    return r;
  });
  if (!row?.companyId || (row.plan !== 'standard' && row.plan !== 'featured'))
    redirect('/employer/jobs');

  const origin = await appOrigin();
  const { body, headers } = buildFakeEvent(
    { ref, listingId: row.id, companyId: row.companyId, plan: row.plan },
    outcome === 'pay' ? 'checkout.session.completed' : 'checkout.session.expired',
    fakePaymentsSecret(),
  );
  const res = await fetch(`${origin}/api/billing/webhook`, {
    method: 'POST',
    body,
    headers,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Webhook rejected the test payment (${res.status})`);
  redirect(
    outcome === 'pay'
      ? `/employer/jobs?paid=${row.id}`
      : `/employer/jobs/${row.id}/edit?checkout=cancelled`,
  );
}
