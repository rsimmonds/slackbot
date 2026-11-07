import { z } from 'zod';
import { readJson } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { handle } from '@/lib/billing/http';
import { BillingError } from '@/lib/billing/subscriptions';
import { acceptInvite } from '@/lib/billing/team';

export const dynamic = 'force-dynamic';
const input = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/) });

/** POST /api/team/invites/accept — accept with the signed-in account's email. */
export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await getViewer();
    if (!viewer) throw new BillingError('Sign in first.', 401);
    const { token } = await readJson(req, input);
    const r = await acceptInvite(viewer, token);
    if (!r.ok)
      throw new BillingError(
        `This invitation can't be used (${r.reason}).`,
        r.reason === 'wrong_email' ? 403 : 410,
      );
    return r;
  });
}
