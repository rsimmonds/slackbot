'use client';

import { Button, Textarea } from '@cmobeat/ui';
import { useActionState, useId } from 'react';
import { decideAction, type DecisionState } from './actions';

/** Approve (amber: a human decision) or reject with a note the employer will see. */
export function DecisionForm({
  listingId,
  title,
  canApprove,
}: {
  listingId: string;
  title: string;
  canApprove: boolean;
}) {
  const [state, action, pending] = useActionState<DecisionState, FormData>(
    decideAction.bind(null, listingId),
    {},
  );
  const noteId = useId();
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={noteId} className="label-mono">
          Note to the employer (required to reject)
        </label>
        <Textarea
          id={noteId}
          name="note"
          rows={2}
          placeholder="Add a reporting line and a comp range that matches the level."
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-small text-critical-ink">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          name="decision"
          value="approve"
          variant="human"
          disabled={pending || !canApprove}
          aria-label={`Approve ${title}`}
        >
          Approve and publish
        </Button>
        <Button
          type="submit"
          name="decision"
          value="reject"
          variant="danger"
          disabled={pending}
          aria-label={`Request changes to ${title}`}
        >
          Request changes
        </Button>
      </div>
    </form>
  );
}
