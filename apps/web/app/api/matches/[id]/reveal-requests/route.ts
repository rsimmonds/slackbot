import { requestIntroduction } from '@/lib/matches/employer';
import { handle, idParam, viewerOrThrow } from '@/lib/matches/shared';

/** POST /api/matches/<id>/reveal-requests — an employer asks to be introduced. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => requestIntroduction(await viewerOrThrow(), await idParam(ctx)), 201);
}
