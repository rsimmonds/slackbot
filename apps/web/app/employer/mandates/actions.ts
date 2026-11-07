'use server';

import { SessionError } from '@cmobeat/ai/interview';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { requireArea } from '@/lib/auth';
import { confirmMandate, saveMandate } from '@/lib/mandates/document';
import { readEditForm } from '@/lib/mandates/form';
import { startSession } from '@/lib/sessions/service';

const msg = (e: unknown) =>
  e instanceof SessionError
    ? e.message
    : e instanceof ZodError
      ? (e.issues[0]?.message ?? 'Check the form.')
      : null;

/** Begin a Mandate Builder session (amber: a person chooses to start). */
export async function startMandateAction() {
  const viewer = await requireArea('employer');
  let id: string;
  try {
    id = (await startSession(viewer, 'mandate')).id;
  } catch (e) {
    const m = msg(e);
    if (!m) throw e;
    redirect(`/employer/mandates/new?error=${encodeURIComponent(m)}`);
  }
  redirect(`/employer/mandates/session/${id}`);
}

export async function saveMandateAction(id: string, fd: FormData) {
  const viewer = await requireArea('employer');
  try {
    await saveMandate(viewer, id, readEditForm(fd));
  } catch (e) {
    const m = msg(e);
    if (!m) throw e;
    redirect(`/employer/mandates/${id}?error=${encodeURIComponent(m)}`);
  }
  redirect(`/employer/mandates/${id}?saved=1`);
}

/** The employer's sign-off on the mandate (amber, human decision). */
export async function confirmMandateAction(id: string) {
  const viewer = await requireArea('employer');
  try {
    await confirmMandate(viewer, id);
  } catch (e) {
    const m = msg(e);
    if (!m) throw e;
    redirect(`/employer/mandates/${id}?error=${encodeURIComponent(m)}`);
  }
  redirect(`/employer/mandates/${id}?confirmed=1`);
}
