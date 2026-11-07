import { z } from 'zod';
import { decideReveal } from '@/lib/matches/candidate';
import { handle, idParam, readBody, viewerOrThrow } from '@/lib/matches/shared';

/**
 * POST /api/matches/reveal-requests/<requestId>/decision — the candidate accepts (with the
 * Consent Gate acknowledgement) or declines. Body: { accept: true, acknowledged: true } | { accept: false }.
 */
export async function POST(req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  return handle(async () => {
    const viewer = await viewerOrThrow();
    const id = await idParam(ctx, 'requestId');
    return decideReveal(viewer, id, await readBody(req, z.unknown()));
  });
}
