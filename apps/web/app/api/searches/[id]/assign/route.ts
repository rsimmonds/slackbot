import { NextResponse } from 'next/server';
import { apiError, uuidPattern } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { assignSearch, SearchError } from '@/lib/searches/service';

export const dynamic = 'force-dynamic';

/** POST /api/searches/[id]/assign — a talent partner takes an unassigned search. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) throw new SearchError('Search not found.', 404);
    return NextResponse.json({ data: await assignSearch(await getViewer(), id) });
  } catch (e) {
    return apiError(e);
  }
}
