'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { EditorialError } from '@/lib/editorial/access';
import { resolveQueueItem } from '@/lib/agents/monitoring';

export async function resolveQueueAction(id: string) {
  try {
    await resolveQueueItem(await getViewer(), id);
  } catch (e) {
    if (e instanceof EditorialError) redirect('/console/agents?resolved=already');
    throw e;
  }
  revalidatePath('/console/agents');
  redirect('/console/agents?resolved=1');
}
