'use client';

import { Button, Field, Textarea } from '@cmobeat/ui';
import { useActionState } from 'react';
import { cancelCoachingAction, requestCoachingAction, type CoachingState } from './actions';

function Feedback({ state }: { state: CoachingState }) {
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

export function CoachingRequestForm() {
  const [state, action, pending] = useActionState<CoachingState, FormData>(
    requestCoachingAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        label="What would you like help with?"
        hint="Encrypted. Only your talent partner reads it."
      >
        {(id) => (
          <Textarea
            id={id}
            name="topic"
            rows={4}
            required
            minLength={10}
            maxLength={2000}
            placeholder="Preparing for a board interview, negotiating an offer, shaping your next mandate…"
          />
        )}
      </Field>
      <div>
        <Button type="submit" variant="human" disabled={pending}>
          Request a coaching session
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function CancelCoachingButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<CoachingState, FormData>(
    () => cancelCoachingAction(id),
    {},
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        Cancel request
      </Button>
      <Feedback state={state} />
    </form>
  );
}
