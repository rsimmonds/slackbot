import { getViewer } from '@/lib/auth';
import { readJsonBody, requireUuid, sessionError, sseResponse } from '@/lib/sessions/http';
import { answerInput, answerSession } from '@/lib/sessions/service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sessions/[id]/answer — Server-Sent Events:
 * `thinking` → `token`* → `question` (next question), or `done`; `error` on failure.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    requireUuid(id);
    const { answer } = answerInput.parse(await readJsonBody(req));
    const events = answerSession(await getViewer(), id, answer);
    // Pull the first event before responding so auth, ownership and rate-limit errors return a
    // proper status code instead of an error inside an open stream.
    const first = await events.next();
    async function* replay() {
      if (!first.done) yield first.value;
      yield* events;
    }
    return sseResponse(replay());
  } catch (e) {
    return sessionError(e);
  }
}
