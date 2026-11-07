import 'server-only';
import { subscriptionPlans } from '@cmobeat/config';
import { subscriptions } from '@cmobeat/db';
import {
  buildFakeInvoicePaymentFailed,
  buildFakeSubscriptionDeleted,
  buildFakeSubscriptionInvoicePaid,
  buildFakeSubscriptionUpdated,
  fakeCheckoutToken,
  fakeCustomerId,
  fakePaymentsSecret,
  fakePortalToken,
  newFakeSubscriptionRef,
  paymentsProvider,
  verifyFakeToken,
  type FakeCheckoutToken,
  type FakePortalToken,
  type FakeSubscriptionState,
} from '@cmobeat/payments';
import { eq } from 'drizzle-orm';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { BillingError, employerBilling } from './subscriptions';

/**
 * The TEST checkout and TEST portal pages for subscriptions. They send signed events to the real
 * webhook route, exactly as Stripe would, so the same verification and idempotency code runs.
 * Fake provider only; refused on production deployments by paymentsProvider().
 */

function requireFake() {
  if (paymentsProvider().name !== 'fake') throw new BillingError('Test billing is disabled.', 404);
}

async function post(origin: string, signed: { body: string; headers: Record<string, string> }) {
  const res = await fetch(`${origin}/api/billing/webhook`, {
    method: 'POST',
    body: signed.body,
    headers: signed.headers,
    cache: 'no-store',
  });
  if (!res.ok) throw new BillingError(`The webhook rejected the test event (${res.status}).`, 502);
}

/** Only the people who could have started this checkout may complete it. */
async function authorizeOwner(
  viewer: Viewer,
  owner: { companyId: string | null; userId: string | null },
) {
  if (owner.companyId) {
    const b = await employerBilling(viewer);
    if (b.companyId !== owner.companyId || b.seatRole === 'member')
      throw new BillingError('This checkout belongs to someone else.', 403);
  } else if (owner.userId !== viewer.id) {
    throw new BillingError('This checkout belongs to someone else.', 403);
  }
}

export function readCheckoutToken(token: string): FakeCheckoutToken {
  requireFake();
  const t = verifyFakeToken(token, fakeCheckoutToken, fakePaymentsSecret());
  if (!t) throw new BillingError('This test checkout link has expired. Start again.', 410);
  return t;
}

export async function completeFakeSubscriptionCheckout(
  viewer: Viewer,
  token: string,
  outcome: 'pay' | 'cancel',
  origin: string,
): Promise<string> {
  const t = readCheckoutToken(token);
  await authorizeOwner(viewer, t);
  if (outcome === 'cancel') return t.cancelUrl;
  const ref = newFakeSubscriptionRef();
  const secret = fakePaymentsSecret();
  await post(
    origin,
    buildFakeSubscriptionUpdated(
      {
        subscriptionRef: ref,
        customerId: fakeCustomerId(t.companyId ?? t.userId!),
        product: t.product,
        companyId: t.companyId,
        userId: t.userId,
        status: 'active',
        seats: t.seats,
        currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
        cancelAtPeriodEnd: false,
      },
      secret,
    ),
  );
  await post(
    origin,
    buildFakeSubscriptionInvoicePaid({ subscriptionRef: ref, product: t.product }, secret),
  );
  return t.successUrl;
}

export interface FakePortal {
  token: FakePortalToken;
  state: FakeSubscriptionState;
}

/** The portal shows the subscription only to people who may see it under RLS. */
export async function readPortal(viewer: Viewer, token: string): Promise<FakePortal> {
  requireFake();
  const t = verifyFakeToken(token, fakePortalToken, fakePaymentsSecret());
  if (!t)
    throw new BillingError('This test portal link has expired. Open it again from billing.', 410);
  const row = await asViewer(viewer, async (tx) => {
    const [r] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, t.subscriptionRef))
      .limit(1);
    return r;
  });
  if (!row) throw new BillingError('Subscription not found.', 404);
  await authorizeOwner(viewer, row);
  return {
    token: t,
    state: {
      subscriptionRef: row.stripeSubscriptionId,
      customerId: row.stripeCustomerId,
      product: row.product as FakeSubscriptionState['product'],
      companyId: row.companyId,
      userId: row.userId,
      status: (['active', 'past_due', 'canceled', 'incomplete'].includes(row.status)
        ? row.status
        : 'incomplete') as FakeSubscriptionState['status'],
      seats: row.seats,
      currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    },
  };
}

export type PortalChange =
  | { kind: 'seats'; seats: number }
  | { kind: 'cancel'; cancel: boolean }
  | { kind: 'end' }
  | { kind: 'renew' }
  | { kind: 'fail_payment' };

/** Apply one change from the TEST portal by sending the event Stripe would send. */
export async function applyPortalChange(
  viewer: Viewer,
  token: string,
  change: PortalChange,
  origin: string,
): Promise<void> {
  const { state } = await readPortal(viewer, token);
  const secret = fakePaymentsSecret();
  const plan = subscriptionPlans[state.product];
  if (change.kind === 'end')
    return post(origin, buildFakeSubscriptionDeleted(state.subscriptionRef, secret));
  if (change.kind === 'fail_payment')
    return post(origin, buildFakeInvoicePaymentFailed(state.subscriptionRef, secret));
  if (change.kind === 'renew') {
    // A new period: paid invoice, then the period end moves forward and status is active again.
    await post(
      origin,
      buildFakeSubscriptionInvoicePaid(
        { subscriptionRef: state.subscriptionRef, product: state.product },
        secret,
      ),
    );
    return post(
      origin,
      buildFakeSubscriptionUpdated(
        {
          ...state,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
        },
        secret,
      ),
    );
  }
  if (change.kind === 'seats') {
    if (state.product !== 'employer_subscription')
      throw new BillingError('Concierge has one seat.', 400);
    if (!Number.isInteger(change.seats) || change.seats < 1 || change.seats > plan.maxSeats)
      throw new BillingError(`Choose between 1 and ${plan.maxSeats} seats.`, 400);
    return post(origin, buildFakeSubscriptionUpdated({ ...state, seats: change.seats }, secret));
  }
  return post(
    origin,
    buildFakeSubscriptionUpdated({ ...state, cancelAtPeriodEnd: change.cancel }, secret),
  );
}
