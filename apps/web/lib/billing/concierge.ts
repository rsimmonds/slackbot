import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  adminDb,
  audit,
  coachingRequests,
  decryptField,
  encryptField,
  userRoles,
  users,
} from '@cmobeat/db';
import { coachingRequestedEmail, coachingScheduledEmail, sendEmail } from '@cmobeat/email';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { hasActiveConcierge } from './status';
import { BillingError, conciergeSubscription } from './subscriptions';

const topicAad = (id: string) => `coaching_requests.topic:${id}`;

export interface CoachingRequest {
  id: string;
  topic: string;
  status: 'requested' | 'scheduled' | 'done' | 'cancelled';
  scheduledAt: Date | null;
  createdAt: Date;
  takenByMe?: boolean;
  taken?: boolean;
}

async function decryptRows(rows: (typeof coachingRequests.$inferSelect)[], viewerId: string) {
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      topic: await decryptField(r.topic, { aad: topicAad(r.id) }),
      status: r.status,
      scheduledAt: r.scheduledAt,
      createdAt: r.createdAt,
      takenByMe: r.talentPartnerId === viewerId,
      taken: !!r.talentPartnerId,
    })),
  );
}

function requireCandidate(viewer: Viewer | null): asserts viewer is Viewer {
  if (!viewer) throw new BillingError('Sign in first.', 401);
  if (!viewer.roles.includes('candidate'))
    throw new BillingError('Concierge is for candidates.', 403);
}

function requireTalent(viewer: Viewer | null): asserts viewer is Viewer {
  if (!viewer) throw new BillingError('Sign in first.', 401);
  if (!viewer.roles.some((r) => r === 'talent_partner' || r === 'admin'))
    throw new BillingError('Coaching is run by talent partners.', 403);
}

export async function conciergeState(viewer: Viewer) {
  requireCandidate(viewer);
  const subscription = await conciergeSubscription(viewer);
  const requests = await asViewer(viewer, async (tx) =>
    decryptRows(
      await tx
        .select()
        .from(coachingRequests)
        .where(eq(coachingRequests.userId, viewer.id))
        .orderBy(desc(coachingRequests.createdAt)),
      viewer.id,
    ),
  );
  return { subscription, requests };
}

export const coachingInput = z.object({ topic: z.string().trim().min(10).max(2000) });

/** A concierge member asks for coaching. The topic is encrypted; emails never carry it. */
export async function requestCoaching(
  viewer: Viewer | null,
  topic: string,
): Promise<{ id: string }> {
  requireCandidate(viewer);
  if (!(await hasActiveConcierge(viewer.id)))
    throw new BillingError('Coaching is part of concierge. Subscribe to request a session.', 402);
  const id = randomUUID();
  await asViewer(viewer, async (tx) => {
    const open = await tx
      .select({ id: coachingRequests.id })
      .from(coachingRequests)
      .where(
        and(
          eq(coachingRequests.userId, viewer.id),
          inArray(coachingRequests.status, ['requested']),
        ),
      );
    if (open.length >= 2)
      throw new BillingError(
        'You already have two requests waiting. A talent partner will be in touch.',
        409,
      );
    await tx.insert(coachingRequests).values({
      id,
      userId: viewer.id,
      topic: await encryptField(topic, { aad: topicAad(id) }),
    });
    await audit(tx, {
      actorId: viewer.id,
      action: 'coaching.requested',
      targetType: 'coaching',
      targetId: id,
    });
  });
  const partners = await adminDb()
    .select({ email: users.email })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, 'talent_partner'), isNull(users.deletedAt)));
  for (const p of partners) await sendEmail(await coachingRequestedEmail(p.email));
  return { id };
}

export async function cancelCoaching(viewer: Viewer | null, id: string): Promise<void> {
  requireCandidate(viewer);
  await asViewer(viewer, async (tx) => {
    const rows = await tx
      .update(coachingRequests)
      .set({ status: 'cancelled' })
      .where(and(eq(coachingRequests.id, id), eq(coachingRequests.userId, viewer.id)))
      .returning({ id: coachingRequests.id });
    if (!rows.length) throw new BillingError('Request not found.', 404);
    await audit(tx, {
      actorId: viewer.id,
      action: 'coaching.cancelled',
      targetType: 'coaching',
      targetId: id,
    });
  });
}

/** Talent partners: open and scheduled requests, oldest first. */
export async function coachingQueue(viewer: Viewer | null): Promise<CoachingRequest[]> {
  requireTalent(viewer);
  return asViewer(viewer, async (tx) =>
    decryptRows(
      await tx
        .select()
        .from(coachingRequests)
        .where(inArray(coachingRequests.status, ['requested', 'scheduled']))
        .orderBy(coachingRequests.createdAt),
      viewer.id,
    ),
  );
}

export const coachingAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('take') }),
  z.object({
    action: z.literal('schedule'),
    at: z.iso.datetime({ offset: true }).or(z.iso.datetime({ local: true })),
  }),
  z.object({ action: z.literal('done') }),
]);

export async function actOnCoaching(
  viewer: Viewer | null,
  id: string,
  input: z.infer<typeof coachingAction>,
): Promise<void> {
  requireTalent(viewer);
  const at = input.action === 'schedule' ? new Date(input.at) : null;
  if (at && (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 60_000))
    throw new BillingError('Choose a time in the future.', 400);
  const ownerId = await asViewer(viewer, async (tx) => {
    const [row] = await tx
      .select()
      .from(coachingRequests)
      .where(eq(coachingRequests.id, id))
      .limit(1);
    if (!row) throw new BillingError('Request not found.', 404);
    if (row.talentPartnerId && row.talentPartnerId !== viewer.id)
      throw new BillingError('Another talent partner has taken this request.', 409);
    if (row.status === 'done' || row.status === 'cancelled')
      throw new BillingError('This request is closed.', 409);
    const set =
      input.action === 'take'
        ? { talentPartnerId: viewer.id }
        : input.action === 'schedule'
          ? { talentPartnerId: viewer.id, status: 'scheduled' as const, scheduledAt: at }
          : { talentPartnerId: viewer.id, status: 'done' as const };
    if (input.action === 'done' && row.status !== 'scheduled')
      throw new BillingError('Schedule the session before marking it done.', 409);
    await tx.update(coachingRequests).set(set).where(eq(coachingRequests.id, id));
    await audit(tx, {
      actorId: viewer.id,
      action: `coaching.${input.action === 'take' ? 'taken' : input.action === 'schedule' ? 'scheduled' : 'done'}`,
      targetType: 'coaching',
      targetId: id,
    });
    return row.userId;
  });
  if (input.action === 'schedule') {
    const [u] = await adminDb()
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, ownerId));
    if (u) {
      const when = new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(at!);
      await sendEmail(await coachingScheduledEmail(u.email, `${when} UTC`));
    }
  }
}
