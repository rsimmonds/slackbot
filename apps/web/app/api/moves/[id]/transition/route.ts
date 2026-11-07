import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { EditorialError } from '@/lib/editorial/access';
import { jsonHandler, readJson, uuidParam } from '@/lib/editorial/http';
import { approveMove, moveEditSchema, rejectMove } from '@/lib/editorial/moves';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), edit: moveEditSchema.optional() }),
  z.object({ action: z.literal('reject'), note: z.string() }),
]);

/**
 * POST /api/moves/:id/transition — editors approve (publish) or reject a draft move.
 * { action: "approve", edit?: {...} } | { action: "reject", note }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return jsonHandler(async () => {
    const id = uuidParam((await params).id);
    const input = body.parse(await readJson(req));
    const viewer = await getViewer();
    if (!viewer) throw new EditorialError('forbidden', 'Sign in.');
    if (input.action === 'approve') {
      await approveMove(viewer, id, input.edit);
      return { id, status: 'approved' };
    }
    await rejectMove(viewer, id, { note: input.note });
    return { id, status: 'rejected' };
  });
}
