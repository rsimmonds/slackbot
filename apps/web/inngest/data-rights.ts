import { runDataDeletions, runDataExports, runProfileRetention } from '@/lib/data-rights';
import { inngest } from './client';

/** Every 15 minutes: build requested data exports (spec 9.5). */
export const dataExports = inngest.createFunction(
  { id: 'data-rights-exports', triggers: { cron: '*/15 * * * *' }, retries: 3 },
  async ({ step }) =>
    step.run('build-exports', async () => ({ built: (await runDataExports()).length })),
);

/** Daily: permanently delete accounts whose 7-day grace period has passed. 03:17 UTC. */
export const dataDeletions = inngest.createFunction(
  { id: 'data-rights-deletions', triggers: { cron: '17 3 * * *' }, retries: 3 },
  async ({ step }) =>
    step.run('delete-accounts', async () => ({ completed: (await runDataDeletions()).length })),
);

/** Daily: anonymize candidate profiles inactive for 24 months; remove old export files. 03:41 UTC. */
export const profileRetention = inngest.createFunction(
  { id: 'data-rights-retention', triggers: { cron: '41 3 * * *' }, retries: 3 },
  async ({ step }) => step.run('retention', () => runProfileRetention()),
);
