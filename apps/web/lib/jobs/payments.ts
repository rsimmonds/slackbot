import 'server-only';
import { catalogue } from '@cmobeat/config';
import { adminDb, audit, listings, mandates, payments } from '@cmobeat/db';
import { sendEmail } from '@cmobeat/email';
import type { PaymentEvent } from '@cmobeat/payments';
import { and, eq, inArray } from 'drizzle-orm';
import { paymentReceiptEmail } from '@/emails/jobs';
import {
  applySubscriptionDeleted,
  applySubscriptionInvoicePaid,
  applySubscriptionPaymentFailed,
  applySubscriptionUpdated,
  type SubscriptionOutcome,
} from '@/lib/billing/subscriptions';
import { applyInvoicePaid } from '@/lib/searches/invoices';
import { employerContacts } from './expiry';

export type PaymentOutcome =
  'paid' | 'duplicate' | 'cancelled' | 'ignored' | 'mismatch' | SubscriptionOutcome;

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);

/**
 * Applies a verified payment event. The webhook is the only writer of listings.paid_at, so this
 * runs on the owner connection. Idempotent: payments.stripe_ref (the checkout reference) is unique,
 * so a replayed or duplicate event changes nothing.
 */
export async function applyPaymentEvent(event: PaymentEvent): Promise<PaymentOutcome> {
  const db = adminDb();
  if (event.kind === 'ignored') return 'ignored';
  // Subscriptions (Phase 4): employer plan and candidate concierge.
  if (event.kind === 'subscription.updated') return applySubscriptionUpdated(event);
  if (event.kind === 'subscription.deleted') return applySubscriptionDeleted(event);
  if (event.kind === 'invoice.payment_failed') return applySubscriptionPaymentFailed(event);
  if (event.kind === 'invoice.paid' && event.subscriptionRef)
    return applySubscriptionInvoicePaid(event);
  // Search and fractional fee invoices (Phase 3).
  if (event.kind === 'invoice.paid') return applyInvoicePaid(event);

  if (event.kind === 'checkout.expired') {
    if (!event.listingId) return 'ignored';
    await db
      .update(listings)
      .set({ status: 'draft', checkoutRef: null })
      .where(
        and(
          eq(listings.id, event.listingId),
          eq(listings.checkoutRef, event.ref),
          eq(listings.status, 'pending_payment'),
        ),
      );
    await audit(db, {
      actorId: null,
      action: 'listing.checkout_cancelled',
      targetType: 'listing',
      targetId: event.listingId,
      metadata: { ref: event.ref, provider: event.provider },
    });
    return 'cancelled';
  }

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: listings.id,
        companyId: listings.companyId,
        checkoutRef: listings.checkoutRef,
        status: listings.status,
        title: mandates.title,
      })
      .from(listings)
      .innerJoin(mandates, eq(mandates.id, listings.mandateId))
      .where(eq(listings.id, event.listingId))
      .for('update');
    // The event must match the checkout this listing started, for the same company.
    if (!row || row.checkoutRef !== event.ref || row.companyId !== event.companyId)
      return { outcome: 'mismatch' as const };

    const inserted = await tx
      .insert(payments)
      .values({
        companyId: event.companyId,
        stripeRef: event.ref,
        stripeCustomerId: event.customerId,
        product: event.plan === 'featured' ? 'job_post_featured' : 'job_post_standard',
        amount: event.amount,
        currency: event.currency,
        status: 'paid',
      })
      .onConflictDoNothing({ target: payments.stripeRef })
      .returning({ id: payments.id });
    if (!inserted.length) return { outcome: 'duplicate' as const };

    await tx
      .update(listings)
      .set({
        paidAt: new Date(),
        plan: event.plan,
        featured: event.plan === 'featured',
        status: 'pending_review',
      })
      .where(and(eq(listings.id, row.id), inArray(listings.status, ['draft', 'pending_payment'])));
    await audit(tx, {
      actorId: null,
      action: 'listing.paid',
      targetType: 'listing',
      targetId: row.id,
      metadata: {
        paymentId: inserted[0]!.id,
        eventId: event.eventId,
        plan: event.plan,
        amount: event.amount,
        currency: event.currency,
        provider: event.provider,
      },
    });
    return { outcome: 'paid' as const, title: row.title, companyId: row.companyId! };
  });

  if (result.outcome === 'paid') {
    const planLabel =
      event.plan === 'featured'
        ? catalogue.job_post_featured.label
        : catalogue.job_post_standard.label;
    const mail = paymentReceiptEmail({
      listingTitle: result.title,
      planLabel,
      amount: money(event.amount, event.currency),
      reference: event.ref,
    });
    for (const to of await employerContacts(result.companyId)) {
      await sendEmail({
        to,
        template: 'payment-receipt',
        ...mail,
        payload: { listingId: event.listingId, ref: event.ref },
      });
    }
  }
  return result.outcome;
}
