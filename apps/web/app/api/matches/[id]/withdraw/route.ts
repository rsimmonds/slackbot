import { withdrawReveal } from '@/lib/matches/candidate';
import { handle, idParam, viewerOrThrow } from '@/lib/matches/shared';

/** POST /api/matches/<id>/withdraw — the candidate withdraws a reveal; identity hides at once. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => withdrawReveal(await viewerOrThrow(), await idParam(ctx)));
}
