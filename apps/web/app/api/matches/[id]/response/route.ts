import { z } from 'zod';
import { respondToMatch } from '@/lib/matches/candidate';
import { handle, idParam, readBody, viewerOrThrow } from '@/lib/matches/shared';

/** POST /api/matches/<id>/response — the candidate answers: interested, declined, or a question. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const viewer = await viewerOrThrow();
    const id = await idParam(ctx);
    return respondToMatch(viewer, id, await readBody(req, z.unknown()));
  });
}
