'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { decideListing, decisionInput } from '@/lib/jobs/moderation';
import { PostingError } from '@/lib/jobs/posting';

export interface DecisionState {
  error?: string;
}

export async function decideAction(
  listingId: string,
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const input = decisionInput.safeParse({
    decision: formData.get('decision'),
    note: formData.get('note') || undefined,
  });
  if (!input.success) return { error: input.error.issues[0]?.message ?? 'Invalid decision.' };
  try {
    await decideListing(await getViewer(), listingId, input.data);
  } catch (e) {
    if (e instanceof PostingError) return { error: e.message };
    throw e;
  }
  revalidatePath('/console/listings');
  redirect(`/console/listings?decided=${input.data.decision}`);
}
