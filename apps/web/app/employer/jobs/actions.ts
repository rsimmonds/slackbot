'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { appOrigin } from '@/lib/origin';
import {
  checkoutInput,
  createDraftFromParse,
  mandateFromForm,
  mandateInput,
  parseInput,
  PostingError,
  saveMandate,
  startCheckout,
} from '@/lib/jobs/posting';

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  saved?: boolean;
}

export async function parseJobDescription(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = parseInput.safeParse({
    text: formData.get('text') || undefined,
    url: formData.get('url') || '',
  });
  if (!input.success)
    return { error: input.error.issues[0]?.message ?? 'Paste a job description or a URL.' };
  let listingId: string;
  try {
    ({ listingId } = await createDraftFromParse(await getViewer(), input.data));
  } catch (e) {
    if (e instanceof PostingError) return { error: e.message };
    throw e;
  }
  redirect(`/employer/jobs/${listingId}/edit?parsed=1`);
}

export async function saveMandateAction(
  listingId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const confirm = formData.get('intent') === 'confirm';
  const parsed = mandateInput.safeParse(mandateFromForm(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: 'Check the highlighted fields.', fieldErrors };
  }
  try {
    await saveMandate(await getViewer(), listingId, parsed.data, confirm);
  } catch (e) {
    if (e instanceof PostingError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/employer/jobs/${listingId}/edit`);
  if (confirm) redirect(`/employer/jobs/${listingId}/edit?confirmed=1#plan`);
  return { saved: true };
}

export async function checkoutAction(
  listingId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = checkoutInput.safeParse({ plan: formData.get('plan') });
  if (!input.success) return { error: 'Choose a plan.' };
  let result;
  try {
    result = await startCheckout(await getViewer(), listingId, input.data.plan, await appOrigin());
  } catch (e) {
    if (e instanceof PostingError) return { error: e.message };
    throw e;
  }
  revalidatePath('/employer/jobs');
  redirect(result.kind === 'checkout' ? result.url : `/employer/jobs?resubmitted=${listingId}`);
}
