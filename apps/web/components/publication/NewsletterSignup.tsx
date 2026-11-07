'use client';

import { Button, Input, Status } from '@cmobeat/ui';
import { useActionState, useId } from 'react';
import { signupAction, type FormState } from '@/app/(public)/newsletter/actions';

const marketOptions = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'EU', label: 'European Union' },
  { value: 'UK', label: 'United Kingdom' },
];

const topicOptions = [
  { value: 'moves', label: 'CMO moves' },
  { value: 'interviews', label: 'Interviews' },
  { value: 'comp', label: 'Comp data' },
  { value: 'jobs', label: 'Senior roles' },
];

/**
 * Double opt-in signup. `full` adds market and topic choices; the compact form keeps only the
 * address. The honeypot field is invisible to people and screen readers.
 */
export function NewsletterSignup({
  consentText,
  variant = 'compact',
  source = 'site',
}: {
  consentText: string;
  variant?: 'compact' | 'full';
  source?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(signupAction, {
    status: 'idle',
  });
  const id = useId();

  if (state.status === 'ok') {
    return (
      <div role="status" className="flex flex-col gap-2">
        <Status tone="human">Almost there</Status>
        <p className="text-small text-text-2">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="source" value={source} />
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Leave this field empty</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-email`} className="label-mono">
          Work email
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className="sm:flex-1"
            aria-describedby={`${id}-consent`}
          />
          {variant === 'compact' ? (
            <Button type="submit" disabled={pending}>
              {pending ? 'Sending…' : 'Subscribe'}
            </Button>
          ) : null}
        </div>
      </div>

      {variant === 'full' ? (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-market`} className="label-mono">
              Where you work
            </label>
            <select
              id={`${id}-market`}
              name="market"
              defaultValue=""
              className="h-10 rounded-control border border-line bg-surface px-3 text-small text-text focus:border-synapse focus:outline-none"
            >
              <option value="">Prefer not to say</option>
              {marketOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="label-mono mb-2">Topics (optional)</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {topicOptions.map((t) => (
                <label
                  key={t.value}
                  className="inline-flex items-center gap-2 text-small text-text-2"
                >
                  <input
                    type="checkbox"
                    name="topics"
                    value={t.value}
                    className="size-4 accent-[var(--text)]"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? 'Sending…' : 'Subscribe'}
          </Button>
        </>
      ) : null}

      <p id={`${id}-consent`} className="text-micro text-text-3">
        {consentText} We send a confirmation first.
      </p>
      {state.status === 'error' ? (
        <p role="alert" className="text-small text-critical-ink">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
