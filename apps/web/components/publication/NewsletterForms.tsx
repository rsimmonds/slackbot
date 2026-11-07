'use client';

import { Button, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { useActionState } from 'react';
import type { FormState } from '@/app/(public)/newsletter/actions';

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

/**
 * A single-button form that acts on a token (confirm, unsubscribe). Pressing the button is the
 * human decision; email link scanners cannot do it for the reader.
 */
export function TokenButtonForm({
  action,
  token,
  label,
  human,
  doneHref,
  doneLabel,
}: {
  action: Action;
  token: string;
  label: string;
  human?: boolean;
  doneHref?: string;
  doneLabel?: string;
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, { status: 'idle' });
  if (state.status === 'ok') {
    return (
      <div role="status" className="flex flex-col gap-3">
        <Status tone={human ? 'human' : 'good'}>Done</Status>
        <p className="text-body text-text-2">{state.message}</p>
        {doneHref ? (
          <Link href={doneHref} className="label-mono hover:text-text">
            {doneLabel ?? 'Continue'} →
          </Link>
        ) : null}
      </div>
    );
  }
  return (
    <form action={run} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Button
        type="submit"
        variant={human ? 'human' : 'secondary'}
        size="lg"
        disabled={pending}
        className="self-start"
      >
        {pending ? 'Working…' : label}
      </Button>
      {state.status === 'error' ? (
        <p role="alert" className="text-small text-critical-ink">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

const topicOptions = [
  { value: 'moves', label: 'CMO moves' },
  { value: 'interviews', label: 'Interviews' },
  { value: 'comp', label: 'Comp data' },
  { value: 'jobs', label: 'Senior roles' },
];

export function PreferencesForm({
  action,
  token,
  initial,
}: {
  action: Action;
  token: string;
  initial: { frequency: 'weekly' | 'monthly'; topics: string[] };
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, { status: 'idle' });
  return (
    <form action={run} className="flex flex-col gap-8">
      <input type="hidden" name="token" value={token} />
      <fieldset className="flex flex-col gap-3">
        <legend className="label-mono mb-3">How often</legend>
        {(['weekly', 'monthly'] as const).map((f) => (
          <label key={f} className="inline-flex items-center gap-3 text-body text-text">
            <input
              type="radio"
              name="frequency"
              value={f}
              defaultChecked={initial.frequency === f}
              className="size-4 accent-[var(--text)]"
            />
            {f === 'weekly' ? 'Weekly' : 'Monthly digest'}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="label-mono mb-3">Topics</legend>
        <p className="text-small text-text-3">Leave all unticked to get everything.</p>
        {topicOptions.map((t) => (
          <label key={t.value} className="inline-flex items-center gap-3 text-body text-text">
            <input
              type="checkbox"
              name="topics"
              value={t.value}
              defaultChecked={initial.topics.includes(t.value)}
              className="size-4 accent-[var(--text)]"
            />
            {t.label}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save preferences'}
        </Button>
        {state.status !== 'idle' ? (
          <p
            role={state.status === 'error' ? 'alert' : 'status'}
            className={
              state.status === 'error' ? 'text-small text-critical-ink' : 'text-small text-text-2'
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
