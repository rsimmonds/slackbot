import { getViewer } from '@/lib/auth';
import { handle } from '@/lib/billing/http';
import { BillingError } from '@/lib/billing/subscriptions';
import { teamFor } from '@/lib/billing/team';

export const dynamic = 'force-dynamic';

/** GET /api/team — members, pending invitations (admins only) and seats. */
export async function GET() {
  return handle(async () => {
    const viewer = await getViewer();
    if (!viewer) throw new BillingError('Sign in first.', 401);
    const t = await teamFor(viewer);
    return {
      members: t.members,
      invites: t.invites,
      used: t.used,
      limit: t.limit,
      canManage: t.canManage,
    };
  });
}
