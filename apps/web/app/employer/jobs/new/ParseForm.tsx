'use client';

import { Button, Field, Input, Iris, SignalLine, Textarea } from '@cmobeat/ui';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { parseJobDescription, type FormState } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Button type="submit" variant="machine" disabled={pending}>
          {pending ? 'Reading…' : 'Read this description'}
        </Button>
        {pending ? (
          <span className="label-mono text-synapse-ink">
            Reading your description. I&apos;ll draft the mandate.
          </span>
        ) : null}
      </div>
      {pending ? <SignalLine label="Parsing job description" /> : null}
    </div>
  );
}

function Presence() {
  const { pending } = useFormStatus();
  return <Iris state={pending ? 'thinking' : 'idle'} size={64} />;
}

export function ParseForm() {
  const [state, action] = useActionState<FormState, FormData>(parseJobDescription, {});
  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-6">
        <p className="max-w-xl text-small text-text-2">
          Paste the full description. I&apos;ll turn it into a structured mandate: scope, reporting
          line, priorities and comp. You edit and confirm every field before anything is published.
        </p>
        <Presence />
      </div>
      <Field label="Job description">
        {(id) => (
          <Textarea
            id={id}
            name="text"
            rows={14}
            placeholder="Chief Marketing Officer&#10;Reports to the CEO…"
          />
        )}
      </Field>
      <Field
        label="Or a URL"
        hint="Fetching from a URL arrives with the full Listing Parser. Paste text for now."
      >
        {(id) => (
          <Input id={id} name="url" type="url" placeholder="https://company.example/careers/cmo" />
        )}
      </Field>
      {state.error ? (
        <p role="alert" className="text-small text-critical-ink">
          {state.error}
        </p>
      ) : null}
      <Submit />
    </form>
  );
}
