'use server';

import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/auth';
import { requestIntroduction } from '@/lib/matches/employer';
import { sendMessage } from '@/lib/matches/messages';
import { MatchError } from '@/lib/matches/shared';

export interface ShortlistState {
  error?: string;
  done?: boolean;
}

export async function requestIntroductionAction(
  mandateId: string,
  matchId: string,
): Promise<ShortlistState> {
  try {
    await requestIntroduction(await getViewer(), matchId);
  } catch (e) {
    if (e instanceof MatchError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/employer/mandates/${mandateId}/shortlist`);
  return { done: true };
}

export async function employerMessageAction(
  mandateId: string,
  matchId: string,
  _prev: ShortlistState,
  form: FormData,
): Promise<ShortlistState> {
  try {
    await sendMessage(await getViewer(), matchId, { body: String(form.get('body') ?? '') });
  } catch (e) {
    if (e instanceof MatchError) return { error: e.message };
    if (e instanceof Error && e.name === 'ZodError') return { error: 'Write a message first.' };
    throw e;
  }
  revalidatePath(`/employer/mandates/${mandateId}/shortlist/${matchId}/messages`);
  return { done: true };
}
