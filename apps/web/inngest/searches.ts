import { runFractionalInvoicing } from '@/lib/searches/invoices';
import { inngest } from './client';

/**
 * Monthly, on the 1st at 06:17 UTC: one invoice per running fractional placement for the month.
 * Idempotent per month, so a retry or a second run never bills twice.
 */
export const fractionalInvoicing = inngest.createFunction(
  { id: 'searches-fractional-invoicing', triggers: { cron: '17 6 1 * *' }, retries: 3 },
  async ({ step }) =>
    step.run('invoice-fractional-placements', async () => {
      const refs = await runFractionalInvoicing({ now: new Date() });
      return { invoices: refs.length };
    }),
);
