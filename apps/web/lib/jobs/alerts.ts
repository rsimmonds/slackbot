import 'server-only';
import { adminDb, savedSearches, users } from '@cmobeat/db';
import { sendEmail } from '@cmobeat/email';
import { and, eq, isNull } from 'drizzle-orm';
import { appUrl } from '@/emails/layout';
import { savedSearchAlertEmail } from '@/emails/jobs';
import { filtersSchema, toQuery } from './filters';
import { compLabel, describeFilters, marketLabel } from './format';
import { searchJobs } from './queries';

const HOUR = 3_600_000;
/** A little slack so a daily cron that runs a few minutes early still counts as due. */
const dueAfter = { daily: 23 * HOUR, weekly: 7 * 24 * HOUR - HOUR } as const;

/**
 * Background job (system, owner connection). For each saved search that is due, email the live
 * roles published since its last alert, then record the alert time. Only public listings are read.
 */
export async function runSavedSearchAlerts({ now = new Date() }: { now?: Date } = {}) {
  const db = adminDb();
  const due = await db
    .select({
      id: savedSearches.id,
      name: savedSearches.name,
      query: savedSearches.query,
      frequency: savedSearches.alertFrequency,
      lastAlertedAt: savedSearches.lastAlertedAt,
      createdAt: savedSearches.createdAt,
      email: users.email,
    })
    .from(savedSearches)
    .innerJoin(users, eq(users.id, savedSearches.userId))
    .where(and(isNull(users.deletedAt)));

  let checked = 0;
  let sent = 0;
  for (const s of due) {
    const freq = s.frequency === 'daily' ? 'daily' : 'weekly';
    const since = s.lastAlertedAt ?? s.createdAt;
    if (now.getTime() - since.getTime() < dueAfter[freq]) continue;
    checked++;

    const parsed = filtersSchema.omit({ page: true }).safeParse(s.query);
    if (!parsed.success) continue;
    const filters = parsed.data;
    const { items, total } = await searchJobs(
      db,
      { ...filters, page: 1 },
      { now, since, pageSize: 10 },
    );

    if (total > 0) {
      const mail = savedSearchAlertEmail({
        searchName: s.name ?? describeFilters(filters),
        summary: describeFilters(filters),
        searchUrl: `${appUrl()}/jobs${toQuery(filters)}`,
        roles: items.map((j) => ({
          id: j.listingId,
          title: j.title,
          company: j.companyName,
          comp: compLabel(j.compMin, j.compMax, j.currency, j.compBasis),
          location: j.remote ? 'Remote' : (j.location ?? marketLabel[j.market]),
        })),
      });
      await sendEmail({
        to: s.email,
        template: 'saved-search-alert',
        ...mail,
        payload: { savedSearchId: s.id, count: total },
      });
      sent++;
    }
    await db.update(savedSearches).set({ lastAlertedAt: now }).where(eq(savedSearches.id, s.id));
  }
  return { checked, sent };
}
