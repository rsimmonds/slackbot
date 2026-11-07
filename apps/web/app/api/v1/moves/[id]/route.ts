import { ApiError, v1 } from '@/lib/api-keys/http';
import { getMove } from '@/lib/intelligence/data';

/** GET /api/v1/moves/{id} — one approved move. Scope: moves:read. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return v1(req, 'moves:read', async () => {
    const move = await getMove(id);
    if (!move) throw new ApiError('not_found', 'No published move with that id.');
    return { data: move, rows: 1 };
  });
}

export const dynamic = 'force-dynamic';
