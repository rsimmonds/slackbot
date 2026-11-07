import { runSavedSearchAlerts } from '@/lib/jobs/alerts';
import { runListingExpiry } from '@/lib/jobs/expiry';
import { inngest } from './client';

/** Daily: email saved-search matches (daily searches every day, weekly ones every 7 days). 13:07 UTC. */
export const savedSearchAlerts = inngest.createFunction(
  { id: 'jobs-saved-search-alerts', triggers: { cron: '7 13 * * *' }, retries: 3 },
  async ({ step }) => step.run('send-alerts', () => runSavedSearchAlerts({ now: new Date() })),
);

/** Daily: expire listings past 60 days and send 7-day renewal reminders. 05:13 UTC. */
export const listingExpiry = inngest.createFunction(
  { id: 'jobs-listing-expiry', triggers: { cron: '13 5 * * *' }, retries: 3 },
  async ({ step }) =>
    step.run('expire-and-remind', async () => {
      const r = await runListingExpiry({ now: new Date() });
      return { expired: r.expired.length, reminders: r.reminders };
    }),
);
