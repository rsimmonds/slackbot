import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, readJson, uuidPattern } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { placeSearch, SearchError } from '@/lib/searches/service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/searches/[id]/place — record a hire ({ matchId, comp }) for a revealed match and
 * invoice the employer. Comp is first-year cash comp (AI-assisted search) or the monthly retainer
 * (fractional), in whole units of the mandate's currency.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) throw new SearchError('Search not found.', 404);
    const body = await readJson(req, z.unknown());
    return NextResponse.json({ data: await placeSearch(await getViewer(), id, body) });
  } catch (e) {
    return apiError(e);
  }
}
