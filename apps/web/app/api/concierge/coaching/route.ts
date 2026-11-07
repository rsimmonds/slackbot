import { readJson } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import {
  coachingInput,
  coachingQueue,
  conciergeState,
  requestCoaching,
} from '@/lib/billing/concierge';
import { handle } from '@/lib/billing/http';
import { BillingError } from '@/lib/billing/subscriptions';

export const dynamic = 'force-dynamic';

/** GET /api/concierge/coaching — a candidate's own requests, or the queue for talent partners. */
export async function GET() {
  return handle(async () => {
    const viewer = await getViewer();
    if (!viewer) throw new BillingError('Sign in first.', 401);
    if (viewer.roles.some((r) => r === 'talent_partner' || r === 'admin'))
      return coachingQueue(viewer);
    return (await conciergeState(viewer)).requests;
  });
}

/** POST /api/concierge/coaching — a concierge member asks for coaching. */
export async function POST(req: Request) {
  return handle(async () => {
    const { topic } = await readJson(req, coachingInput);
    return requestCoaching(await getViewer(), topic);
  }, 201);
}
