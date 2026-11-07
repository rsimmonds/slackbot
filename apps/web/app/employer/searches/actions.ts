'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { getViewer } from '@/lib/auth';
import { requestSearch, SearchError } from '@/lib/searches/service';

/** The employer accepts the fee terms and requests a search on a confirmed mandate. */
export async function requestSearchAction(formData: FormData) {
  const mandateId = String(formData.get('mandateId') ?? '');
  let id: string;
  try {
    ({ id } = await requestSearch(await getViewer(), {
      mandateId,
      plan: formData.get('plan'),
      acceptTerms: formData.get('acceptTerms') === 'on',
    }));
  } catch (e) {
    const message =
      e instanceof SearchError
        ? e.message
        : e instanceof ZodError
          ? (e.issues[0]?.message ?? 'Check the form.')
          : null;
    if (!message) throw e;
    redirect(
      `/employer/searches/new?mandate=${encodeURIComponent(mandateId)}&error=${encodeURIComponent(message)}`,
    );
  }
  revalidatePath('/employer/searches');
  redirect(`/employer/searches/${id}?requested=1`);
}
