import { currencies } from '@cmobeat/config';
import { audit, sponsorships, type Tx } from '@cmobeat/db';
import { and, asc, desc, eq, gte, lte, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Viewer } from '../auth';
import { asViewer } from '../db';
import { EditorialError } from '../editorial/access';
import { creativeSchema, placements, type Placement } from './shared';

export * from './shared';

export const sponsorshipInput = z
  .object({
    sponsorName: z.string().trim().min(2).max(120),
    placement: z.enum(placements),
    creative: creativeSchema,
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    /** Minor units (cents, pence). */
    amount: z.number().int().min(0).max(100_000_000),
    currency: z.enum(currencies),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'The end date must be on or after the start date.',
    path: ['endDate'],
  });
export type SponsorshipInput = z.infer<typeof sponsorshipInput>;

export const isAdmin = (viewer: Pick<Viewer, 'roles'> | null | undefined) =>
  !!viewer && viewer.roles.includes('admin');

/** App-level check. Postgres RLS (sponsorships_admin) is the second wall. */
export function requireAdmin(viewer: Viewer | null): asserts viewer is Viewer {
  if (!isAdmin(viewer)) {
    throw new EditorialError('forbidden', 'Sponsorships are managed by admins.');
  }
}

export const isoDay = (d = new Date()) => d.toISOString().slice(0, 10);

export type SponsorshipRow = typeof sponsorships.$inferSelect;

export async function listSponsorships(viewer: Viewer | null) {
  requireAdmin(viewer);
  return asViewer(viewer, (tx) =>
    tx
      .select()
      .from(sponsorships)
      .orderBy(desc(sponsorships.startDate), asc(sponsorships.sponsorName)),
  );
}

export async function getSponsorship(viewer: Viewer | null, id: string) {
  requireAdmin(viewer);
  const [row] = await asViewer(viewer, (tx) =>
    tx.select().from(sponsorships).where(eq(sponsorships.id, id)).limit(1),
  );
  if (!row) throw new EditorialError('not_found', 'Sponsorship not found.');
  return row;
}

/** Bookings for the same placement whose dates overlap. A warning, not a block. */
export async function overlapping(
  tx: Tx,
  input: Pick<SponsorshipInput, 'placement' | 'startDate' | 'endDate'>,
  excludeId?: string,
) {
  return tx
    .select({
      id: sponsorships.id,
      sponsorName: sponsorships.sponsorName,
      startDate: sponsorships.startDate,
      endDate: sponsorships.endDate,
    })
    .from(sponsorships)
    .where(
      and(
        eq(sponsorships.placement, input.placement),
        lte(sponsorships.startDate, input.endDate),
        gte(sponsorships.endDate, input.startDate),
        excludeId ? ne(sponsorships.id, excludeId) : undefined,
      ),
    );
}

/** JSON with sorted keys and undefined dropped, so jsonb key order doesn't count as a change. */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );

export interface SaveResult {
  id: string;
  overlaps: { sponsorName: string; startDate: string; endDate: string }[];
}

export async function createSponsorship(viewer: Viewer | null, raw: unknown): Promise<SaveResult> {
  requireAdmin(viewer);
  const input = sponsorshipInput.parse(raw);
  return asViewer(viewer, async (tx) => {
    const overlaps = await overlapping(tx, input);
    const [row] = await tx.insert(sponsorships).values(input).returning({ id: sponsorships.id });
    await audit(tx, {
      actorId: viewer.id,
      action: 'sponsorship.create',
      targetType: 'sponsorship',
      targetId: row!.id,
      metadata: {
        placement: input.placement,
        startDate: input.startDate,
        endDate: input.endDate,
        overlaps: overlaps.length,
      },
    });
    return { id: row!.id, overlaps };
  });
}

export async function updateSponsorship(
  viewer: Viewer | null,
  id: string,
  raw: unknown,
): Promise<SaveResult> {
  requireAdmin(viewer);
  const input = sponsorshipInput.parse(raw);
  return asViewer(viewer, async (tx) => {
    const [before] = await tx.select().from(sponsorships).where(eq(sponsorships.id, id)).limit(1);
    if (!before) throw new EditorialError('not_found', 'Sponsorship not found.');
    const overlaps = await overlapping(tx, input, id);
    await tx
      .update(sponsorships)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(sponsorships.id, id));
    const changed = (Object.keys(input) as (keyof SponsorshipInput)[]).filter(
      (k) => stable(before[k]) !== stable(input[k]),
    );
    await audit(tx, {
      actorId: viewer.id,
      action: 'sponsorship.update',
      targetType: 'sponsorship',
      targetId: id,
      metadata: { changed, overlaps: overlaps.length },
    });
    return { id, overlaps };
  });
}

/** Ends a booking now: it stops showing immediately. A future booking is cancelled outright. */
export async function endSponsorship(viewer: Viewer | null, id: string) {
  requireAdmin(viewer);
  const today = isoDay();
  const yesterday = isoDay(new Date(Date.now() - 86_400_000));
  return asViewer(viewer, async (tx) => {
    const [before] = await tx.select().from(sponsorships).where(eq(sponsorships.id, id)).limit(1);
    if (!before) throw new EditorialError('not_found', 'Sponsorship not found.');
    if (before.endDate < today) return { id, alreadyEnded: true };
    const startDate = before.startDate > yesterday ? yesterday : before.startDate;
    await tx
      .update(sponsorships)
      .set({ startDate, endDate: yesterday, updatedAt: new Date() })
      .where(eq(sponsorships.id, id));
    await audit(tx, {
      actorId: viewer.id,
      action: 'sponsorship.end',
      targetType: 'sponsorship',
      targetId: id,
      metadata: {
        previous: { startDate: before.startDate, endDate: before.endDate },
        cancelledBeforeStart: before.startDate > today,
      },
    });
    return { id, alreadyEnded: false };
  });
}

/**
 * The live booking for a site placement. Read as an anonymous visitor, so an admin browsing the
 * site never sees a booking that isn't public yet. Dates are checked here as well as by RLS.
 */
export async function activeForPlacement(
  placement: Exclude<Placement, 'newsletter'>,
  on = isoDay(),
) {
  const [row] = await asViewer(null, (tx) =>
    tx
      .select({
        id: sponsorships.id,
        sponsorName: sponsorships.sponsorName,
        creative: sponsorships.creative,
      })
      .from(sponsorships)
      .where(
        and(
          eq(sponsorships.placement, placement),
          lte(sponsorships.startDate, on),
          gte(sponsorships.endDate, on),
        ),
      )
      .orderBy(desc(sponsorships.startDate), asc(sponsorships.id))
      .limit(1),
  );
  if (!row) return null;
  const creative = creativeSchema.safeParse(row.creative);
  return creative.success
    ? { id: row.id, sponsorName: row.sponsorName, creative: creative.data }
    : null;
}
