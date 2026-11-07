'use client';

import { Button } from '@cmobeat/ui';
import { useActionState } from 'react';
import { acceptAction, type AcceptState } from './actions';

export function AcceptForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(
    () => acceptAction(token),
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <Button type="submit" variant="human" disabled={pending}>
        Accept and join the team
      </Button>
      {state.error ? (
        <p role="alert" className="text-small text-critical-ink">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
