import { z } from 'zod';
import { readJson } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { handle } from '@/lib/billing/http';
import { startSubscriptionCheckout } from '@/lib/billing/subscriptions';
import { appOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';
const input = z.object({ product: z.enum(['employer_subscription', 'candidate_concierge']) });

/** POST /api/billing/subscriptions — start a subscription checkout. Returns the hosted URL. */
export async function POST(req: Request) {
  return handle(async () => {
    const { product } = await readJson(req, input);
    return startSubscriptionCheckout(await getViewer(), product, await appOrigin(req));
  });
}
