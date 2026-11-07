import { runCareerDigests } from '@/lib/billing/digest';
import { inngest } from './client';

/** Weekly: career digest for candidates who opted in (spec 5.4.4). Mondays 14:23 UTC. */
export const careerDigestWeekly = inngest.createFunction(
  { id: 'career-digest-weekly', triggers: { cron: '23 14 * * 1' }, retries: 3 },
  async ({ step }) => step.run('send-digests', () => runCareerDigests({ now: new Date() })),
);
