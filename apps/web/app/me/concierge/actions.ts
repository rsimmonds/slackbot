'use server';

import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/auth';
import { cancelCoaching, coachingInput, requestCoaching } from '@/lib/billing/concierge';
import { BillingError } from '@/lib/billing/subscriptions';

export interface CoachingState {
  error?: string;
  message?: string;
}

const fail = (e: unknown): CoachingState => {
  if (e instanceof BillingError || (e instanceof Error && e.name === 'PostingError'))
    return { error: e.message };
  throw e;
};

export async function requestCoachingAction(
  _p: CoachingState,
  fd: FormData,
): Promise<CoachingState> {
  const input = coachingInput.safeParse({ topic: fd.get('topic') });
  if (!input.success) return { error: 'Tell us a little more: at least a sentence.' };
  try {
    await requestCoaching(await getViewer(), input.data.topic);
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/me/concierge');
  return { message: 'Requested. A talent partner will propose a time.' };
}

export async function cancelCoachingAction(id: string): Promise<CoachingState> {
  try {
    await cancelCoaching(await getViewer(), id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/me/concierge');
  return { message: 'Cancelled.' };
}
