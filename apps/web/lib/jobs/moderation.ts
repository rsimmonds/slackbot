import 'server-only';
import { hasActiveEmployerSubscription } from '@/lib/billing/status';
import { audit, companies, listings, mandates, type Tx } from '@cmobeat/db';
import { sendEmail } from '@cmobeat/email';
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { listingDecisionEmail } from '@/emails/jobs';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { employerContacts } from './expiry';
import { PostingError } from './posting';

const LISTING_DAYS = 60;

const queueColumns = {
  id: listings.id,
  status: listings.status,
  plan: listings.plan,
  paidAt: listings.paidAt,
  publishedAt: listings.publishedAt,
  expiresAt: listings.expiresAt,
  moderationNote: listings.moderationNote,
  createdAt: listings.createdAt,
  isSample: listings.isSample,
  mandate: mandates,
  companyName: companies.name,
  companyIndustry: companies.industry,
  companyStage: companies.stage,
};

/** Staff console: everything awaiting review, oldest first. RLS limits this to staff. */
export async function moderationQueue(tx: Tx) {
  return tx
    .select(queueColumns)
    .from(listings)
    .innerJoin(mandates, eq(mandates.id, listings.mandateId))
    .innerJoin(companies, eq(companies.id, listings.companyId))
    .where(and(eq(listings.status, 'pending_review'), isNull(listings.deletedAt)))
    .orderBy(asc(listings.createdAt));
}

export async function recentListings(tx: Tx, status: 'live' | 'expired' | 'rejected', limit = 10) {
  return tx
    .select(queueColumns)
    .from(listings)
    .innerJoin(mandates, eq(mandates.id, listings.mandateId))
    .innerJoin(companies, eq(companies.id, listings.companyId))
    .where(and(eq(listings.status, status), isNull(listings.deletedAt)))
    .orderBy(desc(listings.updatedAt))
    .limit(limit);
}

export async function listingCounts(tx: Tx) {
  const rows = await tx
    .select({ status: listings.status, n: count() })
    .from(listings)
    .where(isNull(listings.deletedAt))
    .groupBy(listings.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Partial<
    Record<string, number>
  >;
}

export const decisionInput = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve') }),
  z.object({
    decision: z.literal('reject'),
    note: z.string().trim().min(5, 'Tell the employer what to change.').max(1_000),
  }),
]);

function requireStaff(viewer: Viewer | null): asserts viewer is Viewer {
  if (
    !viewer ||
    !viewer.roles.some((r) => r === 'editor' || r === 'talent_partner' || r === 'admin')
  ) {
    throw new PostingError('Staff only.', 403);
  }
}

/**
 * A person approves or rejects every listing before it reaches readers. Approval makes it live for
 * 60 days, in the reviewer's name. The database refuses to put an unpaid listing live.
 */
export async function decideListing(
  viewer: Viewer | null,
  listingId: string,
  input: z.infer<typeof decisionInput>,
  now = new Date(),
) {
  requireStaff(viewer);
  const outcome = await asViewer(viewer, async (tx) => {
    const [row] = await tx
      .select({
        id: listings.id,
        status: listings.status,
        paidAt: listings.paidAt,
        plan: listings.plan,
        companyId: listings.companyId,
        title: mandates.title,
      })
      .from(listings)
      .innerJoin(mandates, eq(mandates.id, listings.mandateId))
      .where(eq(listings.id, listingId))
      .limit(1);
    if (!row) throw new PostingError('Listing not found.', 404);
    if (row.status !== 'pending_review')
      throw new PostingError('This listing is not awaiting review.', 409);
    if (input.decision === 'approve' && !row.paidAt && row.plan !== 'subscription') {
      throw new PostingError('This listing has not been paid for.', 409);
    }
    if (
      input.decision === 'approve' &&
      !row.paidAt &&
      row.plan === 'subscription' &&
      !(await hasActiveEmployerSubscription(row.companyId!))
    ) {
      throw new PostingError('This company’s subscription is no longer active.', 409);
    }
    const base = { moderatedBy: viewer.id, moderatedAt: now };
    if (input.decision === 'approve') {
      await tx
        .update(listings)
        .set({
          ...base,
          status: 'live',
          moderationNote: null,
          publishedAt: now,
          expiresAt: new Date(now.getTime() + LISTING_DAYS * 86_400_000),
        })
        .where(eq(listings.id, listingId));
    } else {
      await tx
        .update(listings)
        .set({ ...base, status: 'rejected', moderationNote: input.note })
        .where(eq(listings.id, listingId));
    }
    await audit(tx, {
      actorId: viewer.id,
      action: input.decision === 'approve' ? 'listing.approved' : 'listing.rejected',
      targetType: 'listing',
      targetId: listingId,
      metadata: input.decision === 'reject' ? { note: input.note } : {},
    });
    return row;
  });

  const mail = listingDecisionEmail({
    listingTitle: outcome.title,
    approved: input.decision === 'approve',
    note: input.decision === 'reject' ? input.note : null,
    listingId,
  });
  for (const to of await employerContacts(outcome.companyId!)) {
    await sendEmail({
      to,
      template: `listing-${input.decision === 'approve' ? 'approved' : 'rejected'}`,
      ...mail,
      payload: { listingId },
    });
  }
  return { status: input.decision === 'approve' ? 'live' : 'rejected' };
}
