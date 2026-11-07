'use client';

import { Button, Field, Input } from '@cmobeat/ui';
import { useActionState } from 'react';
import { inviteAction, removeAction, revokeAction, type TeamActionState } from './actions';

function Feedback({ state }: { state: TeamActionState }) {
  if (state.error)
    return (
      <p role="alert" className="text-small text-critical-ink">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="text-small text-text-2">
        {state.message}
      </p>
    );
  return null;
}

/** Invite by email. Sending an invitation is a human decision: amber. */
export function InviteForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<TeamActionState, FormData>(inviteAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Work email">
          {(id) => (
            <Input
              id={id}
              name="email"
              type="email"
              required
              placeholder="name@company.com"
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Seat">
          {(id) => (
            <select
              id={id}
              name="seatRole"
              defaultValue="member"
              className="h-10 rounded-control border border-line bg-surface px-3 text-small text-text"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          )}
        </Field>
      </div>
      <div>
        <Button type="submit" variant="human" disabled={pending || disabled}>
          Send invitation
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function RevokeButton({ inviteId, email }: { inviteId: string; email: string }) {
  const [state, action, pending] = useActionState<TeamActionState, FormData>(
    () => revokeAction(inviteId),
    {},
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={`Revoke invitation for ${email}`}
      >
        Revoke
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function RemoveButton({ memberId, name }: { memberId: string; name: string }) {
  const [state, action, pending] = useActionState<TeamActionState, FormData>(
    () => removeAction(memberId),
    {},
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Button
        type="submit"
        variant="danger"
        size="sm"
        disabled={pending}
        aria-label={`Remove ${name}`}
      >
        Remove
      </Button>
      <Feedback state={state} />
    </form>
  );
}
