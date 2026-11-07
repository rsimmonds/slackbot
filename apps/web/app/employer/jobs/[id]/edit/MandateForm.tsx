'use client';

import { currencies, markets } from '@cmobeat/config';
import { Button, Input, Status, Textarea } from '@cmobeat/ui';
import { useActionState, type ReactNode } from 'react';
import { Select } from '@/components/form/Select';
import { saveMandateAction, type FormState } from '../../actions';

export interface MandateValues {
  title: string;
  level: string;
  scope: string | null;
  reportingLine: string | null;
  teamSize: number | null;
  priorities: string[];
  compMin: number | null;
  compMax: number | null;
  currency: string;
  compBasis: string;
  workType: string;
  location: string | null;
  remote: boolean;
  market: string;
}

const levelOptions = [
  ['cmo', 'CMO'],
  ['vp_marketing', 'VP Marketing'],
  ['chief_growth_officer', 'Chief Growth Officer'],
  ['fractional_cmo', 'Fractional CMO'],
] as const;

function Row({
  id,
  label,
  error,
  hint,
  children,
  wide,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={
        wide ? 'col-span-12 flex flex-col gap-2' : 'col-span-12 flex flex-col gap-2 md:col-span-6'
      }
    >
      <label htmlFor={id} className="label-mono">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-micro text-critical-ink">
          {error}
        </p>
      ) : hint ? (
        <p className="text-micro text-text-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function MandateForm({
  listingId,
  values,
  editable,
}: {
  listingId: string;
  values: MandateValues;
  editable: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveMandateAction.bind(null, listingId),
    {},
  );
  const e = state.fieldErrors ?? {};
  const err = (k: string) =>
    e[k] ? { 'aria-invalid': true, 'aria-describedby': `m-${k}-error` } : {};

  return (
    <form action={action} className="grid grid-cols-12 gap-6">
      <fieldset disabled={!editable || pending} className="col-span-12 grid grid-cols-12 gap-6">
        <Row id="m-title" label="Title" error={e.title}>
          <Input id="m-title" name="title" required defaultValue={values.title} {...err('title')} />
        </Row>
        <Row id="m-level" label="Level" error={e.level}>
          <Select id="m-level" name="level" defaultValue={values.level}>
            {levelOptions.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Row>
        <Row
          id="m-scope"
          label="Scope"
          error={e.scope}
          hint="One or two sentences on what the role owns."
          wide
        >
          <Textarea
            id="m-scope"
            name="scope"
            rows={3}
            defaultValue={values.scope ?? ''}
            {...err('scope')}
          />
        </Row>
        <Row id="m-reportingLine" label="Reports to" error={e.reportingLine}>
          <Input
            id="m-reportingLine"
            name="reportingLine"
            defaultValue={values.reportingLine ?? ''}
            placeholder="CEO"
            {...err('reportingLine')}
          />
        </Row>
        <Row id="m-teamSize" label="Team size" error={e.teamSize}>
          <Input
            id="m-teamSize"
            name="teamSize"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={values.teamSize ?? ''}
            {...err('teamSize')}
          />
        </Row>
        <Row
          id="m-priorities"
          label="Priorities"
          error={e.priorities}
          hint="One per line. Three to six concrete outcomes."
          wide
        >
          <Textarea
            id="m-priorities"
            name="priorities"
            rows={5}
            defaultValue={values.priorities.join('\n')}
            {...err('priorities')}
          />
        </Row>

        <fieldset className="col-span-12 grid grid-cols-12 gap-6 rounded-panel border border-line p-5">
          <legend className="label-mono px-2">Compensation · required</legend>
          <Row id="m-compMin" label="From" error={e.compMin}>
            <Input
              id="m-compMin"
              name="compMin"
              type="number"
              min={1}
              inputMode="numeric"
              required
              defaultValue={values.compMin ?? ''}
              {...err('compMin')}
            />
          </Row>
          <Row id="m-compMax" label="To" error={e.compMax}>
            <Input
              id="m-compMax"
              name="compMax"
              type="number"
              min={1}
              inputMode="numeric"
              required
              defaultValue={values.compMax ?? ''}
              {...err('compMax')}
            />
          </Row>
          <Row id="m-currency" label="Currency" error={e.currency}>
            <Select id="m-currency" name="currency" defaultValue={values.currency}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Row>
          <Row id="m-compBasis" label="Basis" error={e.compBasis}>
            <Select id="m-compBasis" name="compBasis" defaultValue={values.compBasis}>
              <option value="annual">Annual base</option>
              <option value="monthly_retainer">Monthly retainer</option>
            </Select>
          </Row>
        </fieldset>

        <Row id="m-workType" label="Work type" error={e.workType}>
          <Select id="m-workType" name="workType" defaultValue={values.workType}>
            <option value="full_time">Full-time</option>
            <option value="fractional">Fractional</option>
          </Select>
        </Row>
        <Row id="m-market" label="Market" error={e.market}>
          <Select id="m-market" name="market" defaultValue={values.market}>
            {markets.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Row>
        <Row id="m-location" label="Location" error={e.location}>
          <Input
            id="m-location"
            name="location"
            defaultValue={values.location ?? ''}
            placeholder="Toronto, Berlin…"
          />
        </Row>
        <div className="col-span-12 flex items-end md:col-span-6">
          <label className="flex items-center gap-3 pb-2.5 text-small text-text-2">
            <input
              type="checkbox"
              name="remote"
              defaultChecked={values.remote}
              className="size-4 accent-[var(--text)]"
            />
            Remote
          </label>
        </div>
      </fieldset>

      {state.error ? (
        <p role="alert" className="col-span-12 text-small text-critical-ink">
          {state.error}
        </p>
      ) : state.saved ? (
        <div className="col-span-12">
          <Status tone="good">Draft saved.</Status>
        </div>
      ) : null}

      {editable ? (
        <div className="col-span-12 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <Button type="submit" name="intent" value="confirm" variant="human" disabled={pending}>
            Confirm mandate
          </Button>
          <Button type="submit" name="intent" value="save" variant="secondary" disabled={pending}>
            Save draft
          </Button>
          <span className="text-micro text-text-3">
            Confirming means you have checked every field. You can still edit before paying.
          </span>
        </div>
      ) : null}
    </form>
  );
}
