import { z } from 'zod';
import { readJson } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { handle } from '@/lib/billing/http';
import { openBillingPortal } from '@/lib/billing/subscriptions';
import { appOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';
const input = z.object({ product: z.enum(['employer_subscription', 'candidate_concierge']) });

/** POST /api/billing/portal — the provider's hosted page to manage a subscription. */
export async function POST(req: Request) {
  return handle(async () => {
    const { product } = await readJson(req, input);
    return openBillingPortal(await getViewer(), product, await appOrigin(req));
  });
}
