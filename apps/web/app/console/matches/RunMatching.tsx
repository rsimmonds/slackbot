'use client';

import { Button, SignalLine } from '@cmobeat/ui';
import { useActionState } from 'react';
import { runMatchingAction, type ActionState } from './actions';

/** Ask the Matcher for proposals. Blue: a machine action. Nothing is approved by it. */
export function RunMatching({ mandateId, title }: { mandateId: string; title: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    () => runMatchingAction(mandateId),
    {},
  );
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <Button
        type="submit"
        variant="machine"
        size="sm"
        disabled={pending}
        aria-label={`Run matching for ${title}`}
      >
        {pending ? 'Matching…' : 'Run matching'}
      </Button>
      {pending ? <SignalLine label="Matching" className="w-32" /> : null}
      {state.message ? (
        <p role="status" className="max-w-xs text-right text-micro text-synapse-ink">
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="max-w-xs text-right text-micro text-critical-ink">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
