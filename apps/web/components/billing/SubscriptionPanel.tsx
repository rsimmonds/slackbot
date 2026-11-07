'use client';

import type { SubscriptionProduct } from '@cmobeat/config';
import { Button, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import { useActionState } from 'react';
import { subscriptionAction, type BillingActionState } from './actions';

export interface SubscriptionSummary {
  status: string;
  active: boolean;
  seats: number;
  renewsOn: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Plan panel for the employer subscription and candidate concierge. Subscribing, cancelling and
 * resuming are human decisions (amber); managing opens the provider's hosted page.
 */
export function SubscriptionPanel({
  product,
  label,
  price,
  summary,
  subscription,
  canManage,
  seatsLine,
  className,
}: {
  product: SubscriptionProduct;
  label: string;
  price: string;
  summary: string;
  subscription: SubscriptionSummary | null;
  canManage: boolean;
  seatsLine?: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState<BillingActionState, FormData>(
    subscriptionAction,
    {},
  );
  const active = subscription?.active ?? false;
  const statusText = !subscription
    ? 'Not subscribed'
    : !active
      ? 'Ended'
      : subscription.status === 'past_due'
        ? 'Payment failed · retrying'
        : subscription.cancelAtPeriodEnd
          ? `Ends ${subscription.renewsOn ?? 'at period end'}`
          : 'Active';

  const button = (intent: string, text: string, variant: 'human' | 'secondary' | 'ghost') => (
    <Button
      type="submit"
      name="intent"
      value={intent}
      variant={variant}
      size="sm"
      disabled={pending}
    >
      {text}
    </Button>
  );

  return (
    <MeshPanel
      className={className}
      eyebrow="Plan"
      title={label}
      actions={
        <Status
          tone={active ? (subscription?.status === 'past_due' ? 'critical' : 'human') : 'neutral'}
        >
          {statusText}
        </Status>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-small text-text-2">{summary}</p>
        <dl className="grid grid-cols-2 gap-4 border-y border-line py-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="label-mono">Price</dt>
            <dd className="numeric text-body text-text">{price} / month</dd>
          </div>
          {seatsLine ? (
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Seats</dt>
              <dd className="numeric text-body text-text">{seatsLine}</dd>
            </div>
          ) : null}
          {active && subscription?.renewsOn ? (
            <div className="flex flex-col gap-1">
              <dt className="label-mono">{subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'}</dt>
              <dd className="numeric text-body text-text">{subscription.renewsOn}</dd>
            </div>
          ) : null}
        </dl>
        {canManage ? (
          <form action={action} className="flex flex-wrap gap-3">
            <input type="hidden" name="product" value={product} />
            {!active ? button('subscribe', `Subscribe · ${price} / month`, 'human') : null}
            {active ? button('manage', 'Manage subscription', 'secondary') : null}
            {active && !subscription?.cancelAtPeriodEnd
              ? button('cancel', 'Cancel at period end', 'ghost')
              : null}
            {active && subscription?.cancelAtPeriodEnd
              ? button('resume', 'Keep my subscription', 'human')
              : null}
          </form>
        ) : (
          <MonoLabel>Your company’s owners and admins manage the plan.</MonoLabel>
        )}
        {state.error ? (
          <p role="alert" className="text-small text-critical-ink">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p role="status" className="text-small text-text-2">
            {state.message}
          </p>
        ) : null}
      </div>
    </MeshPanel>
  );
}
