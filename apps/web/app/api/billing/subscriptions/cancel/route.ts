import { z } from 'zod';
import { readJson } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { handle } from '@/lib/billing/http';
import { setCancelAtPeriodEnd } from '@/lib/billing/subscriptions';
import { appOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';
const input = z.object({
  product: z.enum(['employer_subscription', 'candidate_concierge']),
  cancel: z.boolean(),
});

/** POST /api/billing/subscriptions/cancel — cancel at the end of the period, or resume. */
export async function POST(req: Request) {
  return handle(async () => {
    const { product, cancel } = await readJson(req, input);
    return setCancelAtPeriodEnd(await getViewer(), product, cancel, await appOrigin(req));
  });
}
