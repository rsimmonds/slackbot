'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { parseFilters, toQuery } from '@/lib/jobs/filters';
import { createSavedSearch, deleteSavedSearch, saveSearchInput } from '@/lib/jobs/saved-searches';

export async function saveSearch(formData: FormData) {
  const viewer = await getViewer();
  const raw = String(formData.get('query') ?? '');
  const filters = parseFilters(new URLSearchParams(raw));
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/jobs${toQuery(filters)}`)}`);
  const parsed = saveSearchInput.safeParse({
    name: formData.get('name'),
    frequency: formData.get('frequency'),
    query: filters,
  });
  if (!parsed.success)
    redirect(`/jobs${toQuery(filters)}${toQuery(filters) ? '&' : '?'}save=invalid`);
  await asViewer(viewer, (tx) => createSavedSearch(tx, viewer.id, parsed.data));
  revalidatePath('/account/searches');
  redirect(`/jobs${toQuery(filters)}${toQuery(filters) ? '&' : '?'}saved=1`);
}

export async function removeSearch(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in?next=/account/searches');
  const id = String(formData.get('id') ?? '');
  if (/^[0-9a-f-]{36}$/i.test(id))
    await asViewer(viewer, (tx) => deleteSavedSearch(tx, viewer.id, id));
  revalidatePath('/account/searches');
  redirect('/account/searches');
}
