'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { getViewer } from '@/lib/auth';
import { EditorialError } from '@/lib/editorial/access';
import { createSponsorship, endSponsorship, updateSponsorship } from '@/lib/sponsorships';

export interface SponsorshipFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** Converts the form into the sponsorship input shape. Amount is entered in whole units. */
function formToInput(formData: FormData) {
  const text = (k: string) => String(formData.get(k) ?? '').trim();
  const major = Number(text('amount').replace(/[,\s]/g, ''));
  return {
    sponsorName: text('sponsorName'),
    placement: text('placement'),
    creative: {
      headline: text('headline'),
      body: text('body'),
      url: text('url'),
      logoUrl: text('logoUrl'),
    },
    startDate: text('startDate'),
    endDate: text('endDate'),
    amount: Number.isFinite(major) ? Math.round(major * 100) : NaN,
    currency: text('currency'),
  };
}

function toState(e: unknown): SponsorshipFormState {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of e.issues) {
      const key = String(i.path.at(-1) ?? 'form');
      fieldErrors[key] ??= i.message;
    }
    return { error: 'Check the highlighted fields.', fieldErrors };
  }
  if (e instanceof EditorialError) return { error: e.message };
  throw e;
}

export async function saveSponsorshipAction(
  id: string | null,
  _prev: SponsorshipFormState,
  formData: FormData,
): Promise<SponsorshipFormState> {
  const viewer = await getViewer();
  let result: Awaited<ReturnType<typeof createSponsorship>>;
  try {
    const input = formToInput(formData);
    result = id
      ? await updateSponsorship(viewer, id, input)
      : await createSponsorship(viewer, input);
  } catch (e) {
    return toState(e);
  }
  revalidatePath('/console/sponsorships');
  revalidatePath('/');
  const q = new URLSearchParams({ saved: result.id });
  if (result.overlaps.length)
    q.set('overlaps', result.overlaps.map((o) => o.sponsorName).join(', '));
  redirect(`/console/sponsorships?${q}`);
}

export async function endSponsorshipAction(id: string) {
  await endSponsorship(await getViewer(), id);
  revalidatePath('/console/sponsorships');
  revalidatePath('/');
  redirect('/console/sponsorships?ended=1');
}
