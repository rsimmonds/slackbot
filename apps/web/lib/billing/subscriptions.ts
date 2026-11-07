import 'server-only';
import { freeSeatLimit, subscriptionPlans, type SubscriptionProduct } from '@cmobeat/config';
import {
  adminDb,
  audit,
  auditLog,
  companies,
  employerMembers,
  payments,
  subscriptions,
  users,
  type Tx,
} from '@cmobeat/db';
import {
  sendEmail,
  subscriptionEndedEmail,
  subscriptionPaymentFailedEmail,
  subscriptionStartedEmail,
} from '@cmobeat/email';
import { paymentsProvider, type PaymentEvent } from '@cmobeat/payments';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { employerContacts } from '@/lib/jobs/expiry';
import { employerCompany, PostingError } from '@/lib/jobs/posting';
import { isActive } from './status';

export { hasActiveConcierge, hasActiveEmployerSubscription, isActive } from './status';

/** Billing errors map to JSON responses through the shared apiError helper. */
export class BillingError extends PostingError {
  override name = 'BillingError';
}

export interface SubscriptionView {
  id: string;
  ref: string;
  customerId: string;
  product: SubscriptionProduct;
  status: string;
  seats: number;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  active: boolean;
}

const view = (r: typeof subscriptions.$inferSelect): SubscriptionView => ({
  id: r.id,
  ref: r.stripeSubscriptionId,
  customerId: r.stripeCustomerId,
  product: r.product as SubscriptionProduct,
  status: r.status,
  seats: r.seats,
  currentPeriodEnd: r.currentPeriodEnd,
  cancelAtPeriodEnd: r.cancelAtPeriodEnd,
  active: isActive(r),
});

// ------------------------------------------------------------------ reads

/**
 * The subscription that matters for a company or a user, read under RLS: the active one if there is
 * one, otherwise the most recently updated (so an ended plan still shows as ended).
 */
async function latest(
  tx: Tx,
  where: { companyId?: string; userId?: string },
  product: SubscriptionProduct,
): Promise<SubscriptionView | null> {
  const rows = await tx
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.product, product),
        where.companyId
          ? eq(subscriptions.companyId, where.companyId)
          : eq(subscriptions.userId, where.userId!),
      ),
    )
    .orderBy(desc(subscriptions.updatedAt));
  const row = rows.find((r) => isActive(r)) ?? rows[0];
  return row ? view(row) : null;
}

export interface EmployerBilling {
  companyId: string;
  companyName: string;
  seatRole: 'owner' | 'admin' | 'member';
  subscription: SubscriptionView | null;
}

export async function employerBilling(viewer: Viewer): Promise<EmployerBilling> {
  if (!viewer.roles.includes('employer')) throw new BillingError('Employers only.', 403);
  return asViewer(viewer, async (tx) => {
    const company = await employerCompany(tx, viewer.id);
    if (!company) throw new BillingError('Join your company first.', 403);
    const [me] = await tx
      .select({ seat: employerMembers.seatRole })
      .from(employerMembers)
      .where(and(eq(employerMembers.userId, viewer.id), eq(employerMembers.companyId, company.id)))
      .limit(1);
    return {
      companyId: company.id,
      companyName: company.name,
      seatRole: me?.seat ?? 'member',
      subscription: await latest(tx, { companyId: company.id }, 'employer_subscription'),
    };
  });
}

export async function conciergeSubscription(viewer: Viewer): Promise<SubscriptionView | null> {
  return asViewer(viewer, (tx) => latest(tx, { userId: viewer.id }, 'candidate_concierge'));
}

/** Seats a company may fill: the subscription's seats while active, otherwise the free limit. */
export const seatLimit = (s: SubscriptionView | null) =>
  s?.active ? Math.max(s.seats, 1) : freeSeatLimit;

// ------------------------------------------------------------------ actions

function requireManager(b: EmployerBilling) {
  if (b.seatRole === 'member')
    throw new BillingError('Only your company’s owners and admins manage billing.', 403);
}

async function target(viewer: Viewer | null, product: SubscriptionProduct) {
  if (!viewer) throw new BillingError('Sign in first.', 401);
  if (product === 'employer_subscription') {
    const b = await employerBilling(viewer);
    requireManager(b);
    return { viewer, companyId: b.companyId, userId: null, current: b.subscription };
  }
  if (!viewer.roles.includes('candidate'))
    throw new BillingError('Concierge is for candidates.', 403);
  return {
    viewer,
    companyId: null,
    userId: viewer.id,
    current: await conciergeSubscription(viewer),
  };
}

const returnPath = (product: SubscriptionProduct) =>
  product === 'employer_subscription' ? '/employer/billing' : '/me/concierge';

/** Start a subscription. Refuses a second active subscription for the same company or user. */
export async function startSubscriptionCheckout(
  viewer: Viewer | null,
  product: SubscriptionProduct,
  origin: string,
): Promise<{ url: string }> {
  const t = await target(viewer, product);
  if (t.current?.active) throw new BillingError('You already have an active subscription.', 409);
  const plan = subscriptionPlans[product];
  const back = `${origin}${returnPath(product)}`;
  const session = await paymentsProvider().createSubscriptionCheckout({
    product,
    companyId: t.companyId,
    userId: t.userId,
    seats: plan.includedSeats,
    customerEmail: t.viewer.email,
    successUrl: `${back}?subscribed=1`,
    cancelUrl: back,
  });
  await asViewer(t.viewer, (tx) =>
    audit(tx, {
      actorId: t.viewer.id,
      action: 'subscription.checkout_started',
      targetType: product === 'employer_subscription' ? 'company' : 'user',
      targetId: t.companyId ?? t.userId!,
      metadata: { product, ref: session.ref },
    }),
  );
  return { url: session.url };
}

/** The provider's hosted page for seats, payment details and cancellation. */
export async function openBillingPortal(
  viewer: Viewer | null,
  product: SubscriptionProduct,
  origin: string,
): Promise<{ url: string }> {
  const t = await target(viewer, product);
  if (!t.current) throw new BillingError('There is no subscription to manage yet.', 404);
  return paymentsProvider().createPortalSession({
    subscriptionRef: t.current.ref,
    customerId: t.current.customerId,
    returnUrl: `${origin}${returnPath(product)}`,
  });
}

/**
 * Cancel at the end of the period, or resume. With Stripe this calls the API and the webhook
 * updates our copy; the fake provider changes subscriptions only on its TEST portal, so the caller
 * gets the portal URL instead.
 */
export async function setCancelAtPeriodEnd(
  viewer: Viewer | null,
  product: SubscriptionProduct,
  cancel: boolean,
  origin: string,
): Promise<{ applied: true } | { applied: false; url: string }> {
  const t = await target(viewer, product);
  if (!t.current?.active) throw new BillingError('There is no active subscription.', 404);
  const applied = await paymentsProvider().setCancelAtPeriodEnd(t.current.ref, cancel);
  await asViewer(t.viewer, (tx) =>
    audit(tx, {
      actorId: t.viewer.id,
      action: cancel ? 'subscription.cancel_requested' : 'subscription.resume_requested',
      targetType: 'subscription',
      targetId: t.current!.id,
      metadata: { product },
    }),
  );
  if (applied) return { applied: true };
  return { applied: false, ...(await openBillingPortal(t.viewer, product, origin)) };
}

// ------------------------------------------------------------------ webhook (system)

export type SubscriptionOutcome =
  'created' | 'updated' | 'ended' | 'paid' | 'payment_failed' | 'duplicate' | 'mismatch' | 'retry';

/** Has this provider event already been applied? Every applied event is audit-logged with its id. */
async function seen(eventId: string): Promise<boolean> {
  const [row] = await adminDb()
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.targetType, 'subscription'),
        sql`${auditLog.metadata}->>'eventId' = ${eventId}`,
      ),
    )
    .limit(1);
  return !!row;
}

async function contactsFor(s: { companyId: string | null; userId: string | null }) {
  if (s.companyId) return employerContacts(s.companyId);
  if (!s.userId) return [];
  const [u] = await adminDb()
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.id, s.userId), isNull(users.deletedAt)));
  return u ? [u.email] : [];
}

async function mailAll(
  s: { companyId: string | null; userId: string | null; product: string },
  make: (to: string, label: string, path: string) => Promise<Parameters<typeof sendEmail>[0]>,
  template: string,
) {
  const product = s.product as SubscriptionProduct;
  for (const to of await contactsFor(s)) {
    const mail = await make(to, subscriptionPlans[product].label, returnPath(product));
    await sendEmail({ ...mail, template });
  }
}

/** Created or updated: store the provider's current state (state-based, so replays are harmless). */
export async function applySubscriptionUpdated(
  event: Extract<PaymentEvent, { kind: 'subscription.updated' }>,
): Promise<SubscriptionOutcome> {
  if (await seen(event.eventId)) return 'duplicate';
  const db = adminDb();
  // Ownership must be real: an employer plan for an existing company, concierge for a user.
  if (event.product === 'employer_subscription') {
    if (!event.companyId) return 'mismatch';
    const [c] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, event.companyId));
    if (!c) return 'mismatch';
  } else {
    if (!event.userId) return 'mismatch';
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, event.userId));
    if (!u) return 'mismatch';
  }

  const values = {
    companyId: event.product === 'employer_subscription' ? event.companyId : null,
    userId: event.product === 'candidate_concierge' ? event.userId : null,
    stripeCustomerId: event.customerId,
    stripeSubscriptionId: event.subscriptionRef,
    product: event.product,
    stripePriceId: event.priceId,
    status: event.status,
    seats: Math.min(Math.max(event.seats, 1), subscriptionPlans[event.product].maxSeats),
    currentPeriodEnd: event.currentPeriodEnd,
    cancelAtPeriodEnd: event.cancelAtPeriodEnd,
  };
  const result = await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, event.subscriptionRef))
      .for('update');
    // A subscription never changes owner.
    if (
      before &&
      (before.companyId !== values.companyId ||
        before.userId !== values.userId ||
        before.product !== values.product)
    )
      return { outcome: 'mismatch' as const };
    const [row] = await tx
      .insert(subscriptions)
      .values(values)
      .onConflictDoUpdate({
        target: subscriptions.stripeSubscriptionId,
        set: {
          status: values.status,
          seats: values.seats,
          currentPeriodEnd: values.currentPeriodEnd,
          cancelAtPeriodEnd: values.cancelAtPeriodEnd,
          stripePriceId: values.stripePriceId,
          stripeCustomerId: values.stripeCustomerId,
          updatedAt: new Date(),
        },
      })
      .returning();
    const wasActive = before ? isActive(before) : false;
    const nowActive = isActive(row!);
    await audit(tx, {
      actorId: null,
      action: before ? 'subscription.updated' : 'subscription.created',
      targetType: 'subscription',
      targetId: row!.id,
      metadata: {
        eventId: event.eventId,
        product: event.product,
        status: row!.status,
        seats: row!.seats,
        cancelAtPeriodEnd: row!.cancelAtPeriodEnd,
        provider: event.provider,
      },
    });
    return {
      outcome: before ? ('updated' as const) : ('created' as const),
      started: !wasActive && nowActive,
      ended: wasActive && !nowActive,
      row: row!,
    };
  });
  if (result.outcome === 'mismatch') return 'mismatch';
  if (result.started) await mailAll(result.row, subscriptionStartedEmail, 'subscription-started');
  if (result.ended) await mailAll(result.row, subscriptionEndedEmail, 'subscription-ended');
  return result.outcome;
}

export async function applySubscriptionDeleted(
  event: Extract<PaymentEvent, { kind: 'subscription.deleted' }>,
): Promise<SubscriptionOutcome> {
  if (await seen(event.eventId)) return 'duplicate';
  const db = adminDb();
  const [row] = await db
    .update(subscriptions)
    .set({ status: 'canceled', cancelAtPeriodEnd: false, updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, event.subscriptionRef))
    .returning();
  if (!row) return 'retry';
  await audit(db, {
    actorId: null,
    action: 'subscription.ended',
    targetType: 'subscription',
    targetId: row.id,
    metadata: { eventId: event.eventId, product: row.product, provider: event.provider },
  });
  await mailAll(row, subscriptionEndedEmail, 'subscription-ended');
  return 'ended';
}

/**
 * A paid subscription invoice (first period or renewal): a payments row, idempotent on the invoice
 * reference. If the subscription itself has not arrived yet, ask the provider to retry later.
 */
export async function applySubscriptionInvoicePaid(
  event: Extract<PaymentEvent, { kind: 'invoice.paid' }>,
): Promise<SubscriptionOutcome> {
  const db = adminDb();
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, event.subscriptionRef!));
  if (!sub) return 'retry';
  const product = sub.product as SubscriptionProduct;
  const inserted = await db
    .insert(payments)
    .values({
      companyId: sub.companyId,
      userId: sub.userId,
      stripeCustomerId: sub.stripeCustomerId,
      stripeRef: event.ref,
      product,
      amount: event.amountPaid ?? subscriptionPlans[product].amount,
      currency: event.currency ?? subscriptionPlans[product].currency,
      status: 'paid',
    })
    .onConflictDoNothing({ target: payments.stripeRef })
    .returning({ id: payments.id });
  if (!inserted.length) return 'duplicate';
  await audit(db, {
    actorId: null,
    action: 'subscription.invoice_paid',
    targetType: 'subscription',
    targetId: sub.id,
    metadata: { eventId: event.eventId, paymentId: inserted[0]!.id, provider: event.provider },
  });
  return 'paid';
}

export async function applySubscriptionPaymentFailed(
  event: Extract<PaymentEvent, { kind: 'invoice.payment_failed' }>,
): Promise<SubscriptionOutcome> {
  if (!event.subscriptionRef) return 'mismatch';
  if (await seen(event.eventId)) return 'duplicate';
  const db = adminDb();
  const [row] = await db
    .update(subscriptions)
    .set({ status: 'past_due', updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, event.subscriptionRef))
    .returning();
  if (!row) return 'retry';
  await audit(db, {
    actorId: null,
    action: 'subscription.payment_failed',
    targetType: 'subscription',
    targetId: row.id,
    metadata: { eventId: event.eventId, invoice: event.ref, provider: event.provider },
  });
  await mailAll(row, subscriptionPaymentFailedEmail, 'subscription-payment-failed');
  return 'payment_failed';
}

/** For the subscription panel (a client component): plain values only. */
export function summarize(s: SubscriptionView | null) {
  if (!s) return null;
  return {
    status: s.status,
    active: s.active,
    seats: s.seats,
    renewsOn: s.currentPeriodEnd ? s.currentPeriodEnd.toISOString().slice(0, 10) : null,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
  };
}
