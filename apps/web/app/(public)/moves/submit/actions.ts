'use server';

import { submitTip } from '@cmobeat/ai';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';

export type TipValues = Partial<
  Record<'person' | 'company' | 'role' | 'move' | 'url' | 'note', string>
>;
export type TipFormState =
  { status: 'idle' } | { status: 'error'; message: string; values: TipValues } | { status: 'sent' };

/** Reader tip: signed-in only, validated, rate-limited, stored through the reader's own RLS context. */
export async function sendTip(_prev: TipFormState, form: FormData): Promise<TipFormState> {
  const viewer = await getViewer();
  if (!viewer) return { status: 'error', message: 'Sign in to send a tip.', values: {} };
  const input = Object.fromEntries(
    ['person', 'company', 'role', 'move', 'url', 'note'].map((k) => [k, String(form.get(k) ?? '')]),
  );
  const result = await asViewer(viewer, (tx) => submitTip(tx, viewer.id, input));
  return result.ok ? { status: 'sent' } : { status: 'error', message: result.error, values: input };
}
