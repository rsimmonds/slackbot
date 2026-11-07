import { parseListing } from '@cmobeat/ai';
import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { parseInput, PostingError } from '@/lib/jobs/posting';

export const dynamic = 'force-dynamic';

/** POST /api/listings/parse — employer: run the Listing Parser without saving anything. */
export async function POST(req: Request) {
  try {
    const viewer = await getViewer();
    if (!viewer) throw new PostingError('Sign in as an employer.', 401);
    if (!viewer.roles.includes('employer'))
      throw new PostingError('Only employers can parse listings.', 403);
    const input = await readJson(req, parseInput);
    const result = await parseListing({ ...input, actorId: viewer.id });
    if (!result.ok)
      return NextResponse.json({ error: result.reason, queued: result.queued }, { status: 422 });
    return NextResponse.json({ mandate: result.output, runId: result.runId });
  } catch (e) {
    return apiError(e);
  }
}
