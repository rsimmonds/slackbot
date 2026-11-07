import { getViewer } from '@/lib/auth';
import { isEditorial } from '@/lib/editorial/access';
import { jsonHandler, searchParamsObject } from '@/lib/editorial/http';
import { listMoves, moveFiltersSchema, publicMove } from '@/lib/editorial/moves';

/**
 * GET /api/moves — public list of approved CMO moves.
 * Filters: type, company, q, from, to (YYYY-MM-DD), limit, offset. Editors may also pass status.
 */
export async function GET(req: Request) {
  return jsonHandler(async () => {
    const viewer = await getViewer();
    const filters = moveFiltersSchema.parse(searchParamsObject(req));
    if (filters.status && filters.status !== 'approved' && !isEditorial(viewer))
      filters.status = 'approved';
    const rows = await listMoves(viewer, filters);
    return rows.map(publicMove);
  });
}
