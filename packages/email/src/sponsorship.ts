import { adminDb, sponsorships } from '@cmobeat/db';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import type { SponsorshipCreative } from './templates/Sponsorship';

const creative = z.object({
  headline: z.string().min(1),
  body: z.string().optional(),
  url: z.url({ protocol: /^https$/ }),
});

export type SponsorshipPlacement = 'home' | 'article_foot' | 'jobs_index' | 'newsletter';

/**
 * The booking live on a given day for a placement. Used by the newsletter send job (system work,
 * owner connection), so the issue date decides which sponsor appears, not the server clock.
 * Returns null when nothing is booked or the stored creative is unusable.
 */
export async function activeSponsorship(
  placement: SponsorshipPlacement,
  date: Date | string = new Date(),
): Promise<SponsorshipCreative | null> {
  const day = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  const [row] = await adminDb()
    .select({ sponsorName: sponsorships.sponsorName, creative: sponsorships.creative })
    .from(sponsorships)
    .where(
      and(
        eq(sponsorships.placement, placement),
        lte(sponsorships.startDate, day),
        gte(sponsorships.endDate, day),
      ),
    )
    .orderBy(desc(sponsorships.startDate), asc(sponsorships.id))
    .limit(1);
  if (!row) return null;
  const parsed = creative.safeParse(row.creative);
  return parsed.success ? { sponsorName: row.sponsorName, ...parsed.data } : null;
}
