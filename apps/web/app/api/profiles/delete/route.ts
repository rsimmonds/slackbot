import { z } from 'zod';
import { authMode, endDevSession } from '@/lib/auth';
import { cancelDeletion, requestDeletion } from '@/lib/data-rights';
import { body, handle, signedIn } from '@/lib/profile/http';

/**
 * POST /api/profiles/delete — { confirm: "delete" }. Hides and anonymizes the profile now, signs
 * the person out, and permanently deletes the account after a 7-day grace window.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await signedIn();
    const { confirm } = await body(req, z.object({ confirm: z.string().max(20) }));
    const result = await requestDeletion(viewer, confirm);
    // Clerk sessions are revoked by deleting the Clerk user in the deletion job (see LEGAL_REVIEW P5).
    if (authMode() === 'dev') await endDevSession();
    return {
      requestId: result.request.id,
      graceEndsAt: result.graceEndsAt,
      dueAt: result.request.dueAt,
    };
  }, 202);
}

/** DELETE /api/profiles/delete — cancel a pending deletion during the grace window. */
export async function DELETE() {
  return handle(async () => ({ cancelled: await cancelDeletion(await signedIn()) }));
}
