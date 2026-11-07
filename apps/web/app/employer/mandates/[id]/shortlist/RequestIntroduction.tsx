'use client';

import { Button } from '@cmobeat/ui';
import { useActionState } from 'react';
import { requestIntroductionAction, type ShortlistState } from './actions';

/** Ask to be introduced. The candidate decides; nothing about them is shared until then. */
export function RequestIntroduction({
  mandateId,
  matchId,
}: {
  mandateId: string;
  matchId: string;
}) {
  const [state, action, pending] = useActionState<ShortlistState, FormData>(
    () => requestIntroductionAction(mandateId, matchId),
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <Button type="submit" variant="human" disabled={pending || state.done}>
        {state.done ? 'Request sent' : 'Request introduction'}
      </Button>
      {state.error ? (
        <p role="alert" className="text-small text-critical-ink">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
