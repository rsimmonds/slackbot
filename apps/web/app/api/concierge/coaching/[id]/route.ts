import { readJson, uuidPattern } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { actOnCoaching, cancelCoaching, coachingAction } from '@/lib/billing/concierge';
import { handle } from '@/lib/billing/http';
import { BillingError } from '@/lib/billing/subscriptions';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

async function idFrom(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!uuidPattern.test(id)) throw new BillingError('Request not found.', 404);
  return id;
}

/** POST /api/concierge/coaching/:id — talent partners: take, schedule or mark done. */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = await idFrom(ctx);
    await actOnCoaching(await getViewer(), id, await readJson(req, coachingAction));
    return { ok: true };
  });
}

/** DELETE /api/concierge/coaching/:id — the candidate cancels their own request. */
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = await idFrom(ctx);
    await cancelCoaching(await getViewer(), id);
    return { cancelled: true };
  });
}
