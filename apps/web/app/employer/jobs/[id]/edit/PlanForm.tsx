'use client';

import { Button, cn } from '@cmobeat/ui';
import { useActionState, useState } from 'react';
import { checkoutAction, type FormState } from '../../actions';

export interface PlanOption {
  value: 'standard' | 'featured' | 'subscription';
  label: string;
  price: string;
  detail: string;
}

/** Choose a plan and go to checkout. A paid, rejected listing resubmits without paying again. */
export function PlanForm({
  listingId,
  options,
  current,
  alreadyPaid,
}: {
  listingId: string;
  options: PlanOption[];
  current: string;
  alreadyPaid: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    checkoutAction.bind(null, listingId),
    {},
  );
  const initial = current === 'featured' ? 'featured' : 'standard';
  const [selected, setSelected] = useState<string>(initial);
  return (
    <form action={action} className="flex flex-col gap-6">
      {alreadyPaid ? (
        <input type="hidden" name="plan" value={current === 'featured' ? 'featured' : 'standard'} />
      ) : (
        <fieldset className="grid gap-4 md:grid-cols-2">
          <legend className="sr-only">Plan</legend>
          {options.map((o) => (
            <label
              key={o.value}
              className={cn(
                'mesh flex cursor-pointer flex-col gap-2 p-5 has-[:checked]:border-text-3',
                'has-[:focus-visible]:shadow-[0_0_0_4px_var(--synapse-glow)]',
              )}
            >
              <span className="flex items-center justify-between">
                <span className="text-body text-text">{o.label}</span>
                <input
                  type="radio"
                  name="plan"
                  value={o.value}
                  defaultChecked={o.value === initial}
                  onChange={() => setSelected(o.value)}
                  className="size-4 accent-[var(--text)]"
                />
              </span>
              <span className="numeric text-h3 text-text">{o.price}</span>
              <span className="text-micro text-text-2">{o.detail}</span>
            </label>
          ))}
        </fieldset>
      )}
      {state.error ? (
        <p role="alert" className="text-small text-critical-ink">
          {state.error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {alreadyPaid
            ? 'Resubmit for review'
            : selected === 'subscription'
              ? 'Submit for review'
              : 'Continue to payment'}
        </Button>
      </div>
    </form>
  );
}
