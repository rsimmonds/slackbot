import { refreshMandateEmbedding } from '@/lib/matching/embeddings';
import { runFairnessReport } from '@/lib/matching/fairness';
import {
  collectNightlyBatch,
  proposeMatchesForMandate,
  proposeMatchesForProfile,
  runNightlyMatching,
  submitNightlyBatch,
  useBatchForNightly,
} from '@/lib/matching';
import { MATCHING_EVENTS } from '@/lib/matching/triggers';
import { inngest } from './client';

/**
 * Matching jobs (spec 8.2). Every job only PROPOSES matches; a talent partner approves.
 */
export const matchOnMandateConfirmed = inngest.createFunction(
  {
    id: 'matching-mandate-confirmed',
    name: 'Match a newly confirmed mandate',
    triggers: { event: MATCHING_EVENTS.mandateConfirmed },
    concurrency: { limit: 1, key: 'event.data.mandateId' },
    retries: 2,
  },
  async ({ event, step }) => {
    const mandateId = String(event.data.mandateId);
    await step.run('embed-mandate', () => refreshMandateEmbedding(mandateId).then(() => true));
    return step.run('propose', () => proposeMatchesForMandate(mandateId, { actorId: null }));
  },
);

export const matchOnProfileVisible = inngest.createFunction(
  {
    id: 'matching-profile-visible',
    name: 'Match a profile that became visible',
    triggers: { event: MATCHING_EVENTS.profileVisible },
    concurrency: { limit: 1, key: 'event.data.profileId' },
    retries: 2,
  },
  async ({ event, step }) =>
    step.run('propose', () =>
      proposeMatchesForProfile(String(event.data.profileId), { actorId: null, cap: 20 }),
    ),
);

export const matchNightly = inngest.createFunction(
  {
    id: 'matching-nightly',
    name: 'Nightly matching',
    triggers: { cron: 'TZ=UTC 30 2 * * *' },
    concurrency: 1,
    retries: 1,
  },
  async ({ step }) => {
    if (!useBatchForNightly()) return step.run('match', () => runNightlyMatching());
    const submitted = await step.run('submit-batch', () => submitNightlyBatch());
    if (!submitted.batchId) return { runs: [] };
    // Batches usually finish within the hour; results are guaranteed within 24h.
    for (let i = 0; i < 48; i++) {
      await step.sleep(`wait-${i}`, '30m');
      const done = await step.run(`collect-${i}`, () =>
        collectNightlyBatch(submitted.batchId!, submitted.preps),
      );
      if (done) return { runs: done };
    }
    throw new Error(`Matcher batch ${submitted.batchId} did not finish in 24 hours`);
  },
);

export const fairnessWeekly = inngest.createFunction(
  {
    id: 'matching-fairness-weekly',
    name: 'Weekly Matcher fairness report',
    triggers: { cron: 'TZ=UTC 0 6 * * 1' },
    concurrency: 1,
    retries: 1,
  },
  async ({ step }) =>
    step.run('report', async () => {
      const r = await runFairnessReport();
      return { id: r.id, passed: r.passed };
    }),
);
