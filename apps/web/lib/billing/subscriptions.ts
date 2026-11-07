import 'server-only';
import { adminDb, subscriptions } from '@cmobeat/db';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * PLACEHOLDER (DATA-API worktree). The SUBSCRIPTIONS workstream owns this file; the parent keeps
 * its version at merge. Same signature and meaning: does this company have a live employer
 * subscription? System read: used by the data API, which has no signed-in viewer.
 */
export async function hasActiveEmployerSubscription(companyId: string): Promise<boolean> {
  const [row] = await adminDb()
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.companyId, companyId),
        eq(subscriptions.product, 'employer_subscription'),
        inArray(subscriptions.status, ['active', 'trialing']),
      ),
    )
    .limit(1);
  return !!row;
}
