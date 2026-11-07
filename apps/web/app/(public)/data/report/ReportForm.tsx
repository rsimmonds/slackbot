'use client';

import { Button, Input, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { useActionState, useId } from 'react';
import { requestReportAction, type ReportFormState } from './actions';

const marketOptions = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'EU', label: 'European Union' },
  { value: 'UK', label: 'United Kingdom' },
];

const selectClass =
  'h-10 rounded-control border border-line bg-surface px-3 text-small text-text focus:border-synapse focus:outline-none';

/**
 * The report gate. The newsletter box is unticked and optional: the report never depends on it.
 * The honeypot field is invisible to people and screen readers.
 */
export function ReportForm({ newsletterConsent }: { newsletterConsent: string }) {
  const [state, action, pending] = useActionState<ReportFormState, FormData>(requestReportAction, {
    status: 'idle',
  });
  const id = useId();

  if (state.status === 'ok') {
    return (
      <div role="status" className="flex flex-col gap-4">
        <Status tone="good">Ready</Status>
        <p className="text-body text-text">
          Your report is ready. We have also emailed you the link.
        </p>
        {state.downloadUrl ? (
          <Button asChild size="lg" className="self-start">
            <a href={state.downloadUrl} download>
              Download the report (PDF)
            </a>
          </Button>
        ) : null}
        <p className="text-small text-text-2">The link works for two hours.</p>
        {state.newsletterPending ? (
          <p className="text-small text-text-2">
            Check your inbox to confirm the newsletter. Nothing is sent until you do.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Leave this field empty</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-email`} className="label-mono">
          Work email
        </label>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-company`} className="label-mono">
            Company <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <Input id={`${id}-company`} name="company" autoComplete="organization" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-role`} className="label-mono">
            Role <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <Input id={`${id}-role`} name="role" autoComplete="organization-title" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-market`} className="label-mono">
          Where you work
        </label>
        <select id={`${id}-market`} name="market" required defaultValue="" className={selectClass}>
          <option value="" disabled>
            Choose a market
          </option>
          {marketOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-start gap-3">
        <input
          id={`${id}-newsletter`}
          name="newsletter"
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-[var(--filament-ink)]"
        />
        <label htmlFor={`${id}-newsletter`} className="text-small text-text-2">
          Optional. {newsletterConsent} I will confirm by email first.
        </label>
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="text-small text-critical-ink">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" disabled={pending} className="self-start">
          {pending ? 'Preparing…' : 'Get the report'}
        </Button>
        <p className="text-micro text-text-3">
          We email you the link and keep a record of the request. That is not a newsletter
          subscription. See the{' '}
          <Link href="/legal/privacy" className="underline underline-offset-4 hover:text-text">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </form>
  );
}
