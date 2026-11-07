import { v1 } from '@/lib/api-keys/http';
import { listMoves } from '@/lib/intelligence/data';
import { moveFiltersSchema, queryObject } from '@/lib/intelligence/filters';

/** GET /api/v1/moves — approved CMO moves, newest first, cursor-paginated. Scope: moves:read. */
export async function GET(req: Request) {
  return v1(req, 'moves:read', async (url) => {
    const page = await listMoves(moveFiltersSchema.parse(queryObject(url)));
    return { data: page.data, nextCursor: page.nextCursor, rows: page.data.length };
  });
}

export const dynamic = 'force-dynamic';
