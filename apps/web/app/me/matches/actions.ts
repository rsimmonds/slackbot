'use server';

import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/auth';
import { sendMessage } from '@/lib/matches/messages';
import { MatchError } from '@/lib/matches/shared';

export async function candidateMessageAction(
  matchId: string,
  _prev: { error?: string; done?: boolean },
  form: FormData,
): Promise<{ error?: string; done?: boolean }> {
  try {
    await sendMessage(await getViewer(), matchId, { body: String(form.get('body') ?? '') });
  } catch (e) {
    if (e instanceof MatchError) return { error: e.message };
    if (e instanceof Error && e.name === 'ZodError') return { error: 'Write a message first.' };
    throw e;
  }
  revalidatePath(`/me/matches/${matchId}/messages`);
  return { done: true };
}
