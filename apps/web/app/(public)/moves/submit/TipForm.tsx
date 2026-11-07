'use client';

import { Button, Field, Input, Status, Textarea } from '@cmobeat/ui';
import { useActionState } from 'react';
import { sendTip, type TipFormState } from './actions';

const selectClass =
  'h-10 w-full rounded-control border border-line bg-surface px-3 text-small text-text transition-[border-color] duration-[240ms] ease-calm hover:border-line-strong focus:border-synapse focus:outline-none';

export function TipForm() {
  const [state, action, pending] = useActionState<TipFormState, FormData>(sendTip, {
    status: 'idle',
  });

  if (state.status === 'sent') {
    return (
      <div className="flex flex-col gap-3" role="status">
        <Status tone="human">Received</Status>
        <p className="text-body text-text">
          Thank you. An editor will check the source before anything is published.
        </p>
        <a
          href="/moves/submit"
          className="text-small text-text-2 underline underline-offset-4 hover:text-text"
        >
          Send another tip
        </a>
      </div>
    );
  }

  // React resets the form after each submit; keep what the reader typed when we return an error.
  const v = state.status === 'error' ? state.values : {};
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Person">
          {(id) => (
            <Input id={id} name="person" defaultValue={v.person} required autoComplete="off" />
          )}
        </Field>
        <Field label="Company">
          {(id) => (
            <Input
              id={id}
              name="company"
              defaultValue={v.company}
              required
              autoComplete="organization"
            />
          )}
        </Field>
        <Field label="Role">
          {(id) => (
            <Input
              id={id}
              name="role"
              defaultValue={v.role}
              required
              placeholder="Chief Marketing Officer"
            />
          )}
        </Field>
        <Field label="Move">
          {(id) => (
            <select
              id={id}
              name="move"
              className={selectClass}
              defaultValue={v.move ?? 'appointed'}
            >
              <option value="appointed">Appointed</option>
              <option value="departed">Departed</option>
              <option value="promoted">Promoted</option>
            </select>
          )}
        </Field>
      </div>
      <Field
        label="Public source"
        hint="A company newsroom, press release or filing. We don’t use LinkedIn."
      >
        {(id) => (
          <Input
            id={id}
            name="url"
            defaultValue={v.url}
            type="url"
            required
            placeholder="https://"
            inputMode="url"
          />
        )}
      </Field>
      <Field label="Anything else (optional)">
        {(id) => <Textarea id={id} name="note" defaultValue={v.note} rows={3} maxLength={1000} />}
      </Field>
      {state.status === 'error' ? (
        <p role="alert" className="text-small text-critical-ink">
          {state.message}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <span className="label-mono">Your name is never published</span>
        <Button type="submit" disabled={pending}>
          {pending ? 'Sending…' : 'Send tip'}
        </Button>
      </div>
    </form>
  );
}
