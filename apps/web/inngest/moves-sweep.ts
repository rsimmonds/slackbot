import { adaptersFromEnv, fixtureAdapters, runMovesSweep } from '@cmobeat/ai';
import { inngest } from './client';

/**
 * Moves Tracker sweep, every 2 hours (spec 8.2). One run at a time. Drafts land in the editorial
 * queue; nothing is published without an editor. MOVES_SOURCES=fixtures uses recorded sample
 * sources for local demos.
 */
export const movesSweep = inngest.createFunction(
  {
    id: 'moves-tracker-sweep',
    name: 'Moves Tracker sweep',
    triggers: { cron: 'TZ=UTC 0 */2 * * *' },
    concurrency: 1,
    retries: 2,
  },
  async ({ step }) =>
    step.run('sweep', async () => {
      const adapters =
        process.env.MOVES_SOURCES === 'fixtures' ? fixtureAdapters() : adaptersFromEnv();
      return runMovesSweep({ adapters });
    }),
);
