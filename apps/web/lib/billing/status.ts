import 'server-only';
import { activeSubscriptionStatuses } from '@cmobeat/config';
import { adminDb, subscriptions } from '@cmobeat/db';
import { and, eq } from 'drizzle-orm';

/**
 * Subscription status checks with no other app dependencies, so posting, moderation and the data
 * API can import them without cycles. System reads of status only; no personal data.
 */

/** Active means benefits apply: active, trialing or past_due (retry window), and not past its period. */
export function isActive(
  s: { status: string; currentPeriodEnd: Date | null },
  now = new Date(),
): boolean {
  return (
    (activeSubscriptionStatuses as readonly string[]).includes(s.status) &&
    (!s.currentPeriodEnd || s.currentPeriodEnd > now)
  );
}

/** Does this company hold an active employer subscription? (Used to gate the data API.) */
export async function hasActiveEmployerSubscription(companyId: string): Promise<boolean> {
  const rows = await adminDb()
    .select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.companyId, companyId),
        eq(subscriptions.product, 'employer_subscription'),
      ),
    );
  return rows.some((r) => isActive(r));
}

export async function hasActiveConcierge(userId: string): Promise<boolean> {
  const rows = await adminDb()
    .select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.product, 'candidate_concierge')));
  return rows.some((r) => isActive(r));
}
