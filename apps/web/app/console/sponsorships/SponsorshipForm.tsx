'use client';

import { currencies } from '@cmobeat/config';
import { Button, Input, Textarea } from '@cmobeat/ui';
import { useActionState, useId, type ReactNode } from 'react';
import { Select } from '@/components/form/Select';
import { placementLabel, placements, type Creative } from '@/lib/sponsorships/shared';
import { saveSponsorshipAction, type SponsorshipFormState } from './actions';

export interface SponsorshipFormValues {
  sponsorName: string;
  placement: string;
  creative: Partial<Creative>;
  startDate: string;
  endDate: string;
  /** Minor units. */
  amount: number;
  currency: string;
}

function Row({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy?: string) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label-mono">
        {label}
      </label>
      {children(id, describedBy || undefined)}
      {hint ? (
        <p id={hintId} className="text-micro text-text-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="text-micro text-critical-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SponsorshipForm({
  id,
  initial,
}: {
  id: string | null;
  initial?: SponsorshipFormValues;
}) {
  const [state, action, pending] = useActionState<SponsorshipFormState, FormData>(
    saveSponsorshipAction.bind(null, id),
    {},
  );
  const f = state.fieldErrors ?? {};
  const v = initial;
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <div className="grid gap-6 md:grid-cols-2">
        <Row label="Sponsor" error={f.sponsorName}>
          {(i, d) => (
            <Input
              id={i}
              name="sponsorName"
              defaultValue={v?.sponsorName}
              required
              aria-describedby={d}
            />
          )}
        </Row>
        <Row label="Placement" error={f.placement}>
          {(i, d) => (
            <Select
              id={i}
              name="placement"
              defaultValue={v?.placement ?? 'home'}
              aria-describedby={d}
            >
              {placements.map((p) => (
                <option key={p} value={p}>
                  {placementLabel[p]}
                </option>
              ))}
            </Select>
          )}
        </Row>
      </div>

      <Row label="Headline" hint="Up to 90 characters." error={f.headline}>
        {(i, d) => (
          <Input
            id={i}
            name="headline"
            defaultValue={v?.creative.headline}
            maxLength={90}
            required
            aria-describedby={d}
          />
        )}
      </Row>
      <Row label="Body" hint="Optional. Up to 280 characters, plain text." error={f.body}>
        {(i, d) => (
          <Textarea
            id={i}
            name="body"
            rows={3}
            maxLength={280}
            defaultValue={v?.creative.body}
            aria-describedby={d}
          />
        )}
      </Row>
      <div className="grid gap-6 md:grid-cols-2">
        <Row label="Link" hint="https only. We never add tracking parameters." error={f.url}>
          {(i, d) => (
            <Input
              id={i}
              name="url"
              type="url"
              inputMode="url"
              defaultValue={v?.creative.url}
              placeholder="https://"
              required
              aria-describedby={d}
            />
          )}
        </Row>
        <Row
          label="Logo path (optional)"
          hint='A file we host, e.g. "/sponsors/northwind.svg". No remote images.'
          error={f.logoUrl}
        >
          {(i, d) => (
            <Input id={i} name="logoUrl" defaultValue={v?.creative.logoUrl} aria-describedby={d} />
          )}
        </Row>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Row label="Starts" error={f.startDate}>
          {(i, d) => (
            <Input
              id={i}
              name="startDate"
              type="date"
              defaultValue={v?.startDate}
              required
              aria-describedby={d}
            />
          )}
        </Row>
        <Row label="Ends" hint="Inclusive." error={f.endDate}>
          {(i, d) => (
            <Input
              id={i}
              name="endDate"
              type="date"
              defaultValue={v?.endDate}
              required
              aria-describedby={d}
            />
          )}
        </Row>
        <Row label="Amount" error={f.amount}>
          {(i, d) => (
            <Input
              id={i}
              name="amount"
              inputMode="decimal"
              defaultValue={v ? String(v.amount / 100) : ''}
              placeholder="5000"
              required
              aria-describedby={d}
            />
          )}
        </Row>
        <Row label="Currency" error={f.currency}>
          {(i, d) => (
            <Select id={i} name="currency" defaultValue={v?.currency ?? 'USD'} aria-describedby={d}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Row>
      </div>

      {state.error ? (
        <p role="alert" className="text-small text-critical-ink">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" variant="human" disabled={pending}>
          {id ? 'Save changes' : 'Book sponsorship'}
        </Button>
      </div>
    </form>
  );
}
