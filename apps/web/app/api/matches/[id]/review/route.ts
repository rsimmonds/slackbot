import { reviewMatch } from '@/lib/matches/review';
import { handle, idParam, readBody, viewerOrThrow } from '@/lib/matches/shared';
import { z } from 'zod';

/**
 * POST /api/matches/<id>/review — a talent partner approves (optionally with an edited
 * rationale) or rejects a proposal with a note. Body: { action, rationale? , note? }.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const viewer = await viewerOrThrow();
    const id = await idParam(ctx);
    return reviewMatch(viewer, id, await readBody(req, z.unknown()));
  });
}
