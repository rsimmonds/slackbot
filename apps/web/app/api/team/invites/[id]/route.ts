import { uuidPattern } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { handle } from '@/lib/billing/http';
import { BillingError } from '@/lib/billing/subscriptions';
import { revokeInvite } from '@/lib/billing/team';

export const dynamic = 'force-dynamic';

/** DELETE /api/team/invites/:id — revoke a pending invitation. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    if (!uuidPattern.test(id)) throw new BillingError('Invitation not found.', 404);
    const viewer = await getViewer();
    if (!viewer) throw new BillingError('Sign in first.', 401);
    await revokeInvite(viewer, id);
    return { revoked: true };
  });
}
