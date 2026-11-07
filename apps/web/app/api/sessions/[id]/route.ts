import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { requireUuid, sessionError } from '@/lib/sessions/http';
import { getSession } from '@/lib/sessions/service';

/** GET /api/sessions/[id] — resume: the open question, progress and session reference. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    requireUuid(id);
    return NextResponse.json(
      { data: await getSession(await getViewer(), id) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    return sessionError(e);
  }
}
