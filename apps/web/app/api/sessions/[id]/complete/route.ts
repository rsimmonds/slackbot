import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { requireUuid, sessionError } from '@/lib/sessions/http';
import { completeSession } from '@/lib/sessions/service';

/** POST /api/sessions/[id]/complete — turn a finished session into its output. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    requireUuid(id);
    return NextResponse.json({ data: await completeSession(await getViewer(), id) });
  } catch (e) {
    return sessionError(e);
  }
}
