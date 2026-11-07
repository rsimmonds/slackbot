'use client';

import { Button, Textarea } from '@cmobeat/ui';
import { useActionState, useId, useState } from 'react';
import { reviewAction, type ActionState } from '../actions';

/**
 * Approve (amber: a human decision), optionally editing the rationale first, or reject with a
 * note. Reasons are one per line: "+" for, "-" against.
 */
export function ReviewForm({
  matchId,
  summary,
  reasons,
}: {
  matchId: string;
  summary: string;
  reasons: { reason: string; direction: 'for' | 'against' }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    reviewAction.bind(null, matchId),
    {},
  );
  const [editing, setEditing] = useState(false);
  const ids = { summary: useId(), reasons: useId(), note: useId() };
  const reasonText = reasons
    .map((r) => `${r.direction === 'for' ? '+' : '-'} ${r.reason}`)
    .join('\n');

  return (
    <form action={action} className="flex flex-col gap-5">
      {editing ? (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor={ids.summary} className="label-mono">
              Why it fits, in one or two sentences
            </label>
            <Textarea id={ids.summary} name="summary" rows={3} defaultValue={summary} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={ids.reasons} className="label-mono">
              Reasons, one per line (+ for, - against)
            </label>
            <Textarea id={ids.reasons} name="reasons" rows={5} defaultValue={reasonText} />
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="summary" value={summary} />
          <input type="hidden" name="reasons" value={reasonText} />
        </>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.note} className="label-mono">
          Note (required to reject; kept in the audit trail)
        </label>
        <Textarea
          id={ids.note}
          name="note"
          rows={2}
          placeholder="Wants fractional work only; this role is full-time."
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-small text-critical-ink">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="decision" value="approve" variant="human" disabled={pending}>
          {editing ? 'Save and approve' : 'Approve match'}
        </Button>
        {!editing ? (
          <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
            Edit rationale
          </Button>
        ) : null}
        <Button type="submit" name="decision" value="reject" variant="danger" disabled={pending}>
          Reject
        </Button>
      </div>
    </form>
  );
}
