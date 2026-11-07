import { z } from 'zod';
import { runMatching } from '@/lib/matches/review';
import { handle, readBody, viewerOrThrow } from '@/lib/matches/shared';

const input = z.object({ mandateId: z.uuid() });

/** POST /api/matches/run — a talent partner asks the Matcher for proposals (never approvals). */
export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await viewerOrThrow();
    const { mandateId } = await readBody(req, input);
    return runMatching(viewer, mandateId);
  });
}
