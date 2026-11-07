import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, readJson, uuidPattern } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { changeStatus, SearchError } from '@/lib/searches/service';

export const dynamic = 'force-dynamic';

/** POST /api/searches/[id]/status — the assigned talent partner moves the search ({ status }). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) throw new SearchError('Search not found.', 404);
    const body = await readJson(req, z.unknown());
    return NextResponse.json({ data: await changeStatus(await getViewer(), id, body) });
  } catch (e) {
    return apiError(e);
  }
}
