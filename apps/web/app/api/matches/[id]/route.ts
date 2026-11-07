import { getDossier } from '@/lib/matches/review';
import { handle, idParam, viewerOrThrow } from '@/lib/matches/shared';

/** GET /api/matches/<id> — the Match Dossier, for talent partners only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => getDossier(await viewerOrThrow(), await idParam(ctx)));
}
