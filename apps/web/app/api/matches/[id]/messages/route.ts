import { z } from 'zod';
import { getThread, sendMessage } from '@/lib/matches/messages';
import { handle, idParam, readBody, viewerOrThrow } from '@/lib/matches/shared';

/** GET /api/matches/<id>/messages — the thread, for the two participants of a revealed match. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => getThread(await viewerOrThrow(), await idParam(ctx)));
}

/** POST /api/matches/<id>/messages — send a message. Body: { body }. Stored encrypted. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const viewer = await viewerOrThrow();
    const id = await idParam(ctx);
    return sendMessage(viewer, id, await readBody(req, z.unknown()));
  }, 201);
}
