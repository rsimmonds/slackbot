'use server';

import { redirect } from 'next/navigation';
import { authMode, getViewer, startDevSession } from '@/lib/auth';
import { findUserById } from '@/lib/users';
import { acceptInvite } from '@/lib/billing/team';

export interface AcceptState {
  error?: string;
}

const reasons = {
  unknown: 'This invitation link is not valid.',
  expired: 'This invitation has expired. Ask your teammate to send a new one.',
  used: 'This invitation has already been used.',
  revoked: 'This invitation was withdrawn.',
  wrong_email:
    'This invitation is for a different email address. Sign out, then sign in with the address it was sent to.',
} as const;

/** Accepting is a human decision: the signed-in email must match the invitation. */
export async function acceptAction(token: string): Promise<AcceptState> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);
  const r = await acceptInvite(viewer, token);
  if (!r.ok) return { error: reasons[r.reason] };
  // Dev sign-in keeps roles in the signed session cookie; refresh it so the new seat applies now.
  if (authMode() === 'dev') {
    const fresh = await findUserById(viewer.id);
    if (fresh) await startDevSession(fresh);
  }
  redirect('/employer/team?joined=1');
}
