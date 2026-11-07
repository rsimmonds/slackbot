'use server';

import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/auth';
import { BillingError } from '@/lib/billing/subscriptions';
import { inviteInput, inviteTeammate, removeMember, revokeInvite } from '@/lib/billing/team';
import { appOrigin } from '@/lib/origin';

export interface TeamActionState {
  error?: string;
  message?: string;
}

const fail = (e: unknown): TeamActionState => {
  if (e instanceof BillingError || (e instanceof Error && e.name === 'PostingError'))
    return { error: e.message };
  throw e;
};

export async function inviteAction(_prev: TeamActionState, fd: FormData): Promise<TeamActionState> {
  const input = inviteInput.safeParse({ email: fd.get('email'), seatRole: fd.get('seatRole') });
  if (!input.success) return { error: 'Enter a valid work email.' };
  try {
    const viewer = await getViewer();
    if (!viewer) return { error: 'Sign in first.' };
    await inviteTeammate(viewer, input.data, await appOrigin());
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/employer/team');
  return { message: `Invitation sent to ${input.data.email}. It expires in 14 days.` };
}

export async function revokeAction(inviteId: string): Promise<TeamActionState> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { error: 'Sign in first.' };
    await revokeInvite(viewer, inviteId);
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/employer/team');
  return { message: 'Invitation revoked.' };
}

export async function removeAction(memberId: string): Promise<TeamActionState> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { error: 'Sign in first.' };
    await removeMember(viewer, memberId);
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/employer/team');
  return { message: 'Teammate removed.' };
}
