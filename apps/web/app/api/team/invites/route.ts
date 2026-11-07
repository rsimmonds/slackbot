import { readJson } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { handle } from '@/lib/billing/http';
import { BillingError } from '@/lib/billing/subscriptions';
import { inviteInput, inviteTeammate } from '@/lib/billing/team';
import { appOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';

/** POST /api/team/invites — invite a teammate (owners and admins; within the seat limit). */
export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await getViewer();
    if (!viewer) throw new BillingError('Sign in first.', 401);
    const input = await readJson(req, inviteInput);
    return inviteTeammate(viewer, input, await appOrigin(req));
  }, 201);
}
