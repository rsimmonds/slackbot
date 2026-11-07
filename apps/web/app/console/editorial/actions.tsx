'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ZodError } from 'zod';
import { requireArea } from '@/lib/auth';
import { EditorialError } from '@/lib/editorial/access';
import { createArticle, transitionArticle, updateArticle } from '@/lib/editorial/articles';
import { checkMdx } from '@/lib/editorial/mdx-check';
import { approveMove, rejectMove, saveMove } from '@/lib/editorial/moves';
import { Mdx } from '@/lib/mdx/render';

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
} | null;

function toState(e: unknown): NonNullable<ActionState> {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of e.issues) fieldErrors[i.path.join('.') || 'form'] ??= i.message;
    return { ok: false, message: 'Some fields need attention.', fieldErrors };
  }
  if (e instanceof EditorialError) return { ok: false, message: e.message };
  console.error(e);
  return { ok: false, message: 'Something went wrong. Nothing was changed.' };
}

const editor = () => requireArea('staff');

// ------------------------------------------------------------------ moves

export async function saveMoveAction(id: string, edit: unknown): Promise<ActionState> {
  try {
    const changes = await saveMove(await editor(), id, edit);
    revalidatePath(`/console/editorial/moves/${id}`);
    const n = Object.keys(changes).length;
    return {
      ok: true,
      message: n ? `Saved. ${n} field${n > 1 ? 's' : ''} changed.` : 'No changes to save.',
    };
  } catch (e) {
    return toState(e);
  }
}

export async function approveMoveAction(id: string, edit: unknown): Promise<ActionState> {
  try {
    await approveMove(await editor(), id, edit);
  } catch (e) {
    return toState(e);
  }
  revalidatePath('/console/editorial');
  redirect('/console/editorial?done=move-approved');
}

export async function rejectMoveAction(id: string, note: string): Promise<ActionState> {
  try {
    await rejectMove(await editor(), id, { note });
  } catch (e) {
    return toState(e);
  }
  revalidatePath('/console/editorial');
  redirect('/console/editorial?done=move-rejected');
}

// ------------------------------------------------------------------ articles

export async function saveArticleAction(
  id: string | null,
  input: unknown,
): Promise<NonNullable<ActionState> & { id?: string }> {
  let newId: string | undefined;
  try {
    const viewer = await editor();
    if (id) {
      await updateArticle(viewer, id, input);
      revalidatePath(`/console/editorial/articles/${id}`);
      return { ok: true, message: 'Draft saved.', id };
    }
    newId = (await createArticle(viewer, input)).id;
  } catch (e) {
    return toState(e);
  }
  redirect(`/console/editorial/articles/${newId}?saved=1`);
}

export async function transitionArticleAction(
  id: string,
  t:
    | { action: 'submit' }
    | { action: 'publish'; confirmOwn?: boolean }
    | { action: 'reject'; note: string },
): Promise<ActionState> {
  try {
    await transitionArticle(await editor(), id, t);
  } catch (e) {
    return toState(e);
  }
  revalidatePath('/console/editorial');
  if (t.action === 'submit') {
    revalidatePath(`/console/editorial/articles/${id}`);
    return { ok: true, message: 'Submitted for review.' };
  }
  redirect(`/console/editorial?done=article-${t.action === 'publish' ? 'published' : 'rejected'}`);
}

/**
 * Renders the body with the same server renderer readers get, so the preview is exact.
 * Returns the compile error instead when the body is broken.
 */
export async function previewArticleAction(
  source: string,
): Promise<{ ok: true; node: ReactNode } | { ok: false; error: string }> {
  await editor();
  if (source.length > 200_000) return { ok: false, error: 'The body is too long to preview.' };
  const check = await checkMdx(source);
  if (!check.ok) return { ok: false, error: check.error };
  return { ok: true, node: <Mdx source={source} /> };
}
