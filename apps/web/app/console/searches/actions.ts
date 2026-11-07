'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { getViewer } from '@/lib/auth';
import { assignSearch, changeStatus, placeSearch, SearchError } from '@/lib/searches/service';

const back = (id: string, q: Record<string, string>) =>
  `/console/searches/${id}?${new URLSearchParams(q).toString()}`;

function messageOf(e: unknown): string {
  if (e instanceof SearchError) return e.message;
  if (e instanceof ZodError) return e.issues[0]?.message ?? 'Check the form.';
  throw e;
}

export async function assignAction(id: string) {
  try {
    await assignSearch(await getViewer(), id);
  } catch (e) {
    redirect(back(id, { error: messageOf(e) }));
  }
  revalidatePath('/console/searches');
  redirect(back(id, { done: 'assigned' }));
}

export async function statusAction(id: string, formData: FormData) {
  let warning: string | undefined;
  try {
    ({ warning } = await changeStatus(await getViewer(), id, { status: formData.get('status') }));
  } catch (e) {
    redirect(back(id, { error: messageOf(e) }));
  }
  revalidatePath('/console/searches');
  redirect(back(id, warning ? { warning } : { done: 'moved' }));
}

export async function placeAction(id: string, formData: FormData) {
  try {
    await placeSearch(await getViewer(), id, {
      matchId: formData.get('matchId'),
      comp: String(formData.get('comp') ?? '').replace(/[,\s]/g, ''),
    });
  } catch (e) {
    redirect(back(id, { error: messageOf(e) }));
  }
  revalidatePath('/console/searches');
  redirect(back(id, { done: 'placed' }));
}
