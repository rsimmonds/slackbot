'use client';

import { Button, Field, Input, Status } from '@cmobeat/ui';
import { useActionState, useState } from 'react';
import { apiScopes, scopeLabels } from '@/lib/api-keys/scopes';
import { createKeyAction, type CreateKeyState } from './actions';

/** Create a key and show it exactly once, with a copy button. */
export function CreateKeyForm() {
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createKeyAction, {});
  const [copied, setCopied] = useState(false);

  if (state.created) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <Status tone="human">Key created · {state.created.name}</Status>
        <p className="text-small text-text-2">
          Copy it now. This is the only time it is shown. We store a one-way hash, not the key.
        </p>
        <code
          data-testid="new-api-key"
          className="numeric block overflow-x-auto rounded-control border border-line bg-surface px-3 py-3 text-small break-all text-text"
        >
          {state.created.key}
        </code>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.created!.key);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? 'Copied' : 'Copy key'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => window.location.reload()}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Name" hint="So you can tell keys apart, e.g. “Board dashboard”.">
        {(id) => <Input id={id} name="name" required minLength={2} maxLength={60} />}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="label-mono mb-2">What it may read</legend>
        {apiScopes.map((s) => (
          <label key={s} className="flex items-center gap-3 text-small text-text">
            <input
              type="checkbox"
              name={`scope:${s}`}
              defaultChecked={s === 'moves:read'}
              className="size-4 accent-[var(--filament-ink)]"
            />
            <span>{scopeLabels[s]}</span>
            <span className="label-mono">{s}</span>
          </label>
        ))}
      </fieldset>
      {state.error ? (
        <p role="alert" className="text-small text-critical-ink">
          {state.error}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="human" disabled={pending}>
          {pending ? 'Creating…' : 'Create key'}
        </Button>
      </div>
    </form>
  );
}
