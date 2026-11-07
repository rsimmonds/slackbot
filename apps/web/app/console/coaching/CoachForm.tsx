'use client';

import { Button } from '@cmobeat/ui';
import { useActionState } from 'react';
import { coachAction, type CoachState } from './actions';

export function CoachForm({
  id,
  status,
  takenByMe,
  taken,
}: {
  id: string;
  status: 'requested' | 'scheduled' | 'done' | 'cancelled';
  takenByMe: boolean;
  taken: boolean;
}) {
  const [state, action, pending] = useActionState<CoachState, FormData>(
    coachAction.bind(null, id),
    {},
  );
  if (taken && !takenByMe)
    return <p className="text-micro text-text-3">Taken by another talent partner.</p>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {!taken ? (
          <Button
            type="submit"
            name="intent"
            value="take"
            variant="secondary"
            size="sm"
            disabled={pending}
          >
            Take
          </Button>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className="label-mono">Time (UTC)</span>
          <input
            type="datetime-local"
            name="at"
            aria-label="Session time, UTC"
            className="h-8 rounded-control border border-line bg-surface px-2 text-micro text-text"
          />
        </label>
        <Button
          type="submit"
          name="intent"
          value="schedule"
          variant="human"
          size="sm"
          disabled={pending}
        >
          Schedule
        </Button>
        {status === 'scheduled' ? (
          <Button
            type="submit"
            name="intent"
            value="done"
            variant="ghost"
            size="sm"
            disabled={pending}
          >
            Mark done
          </Button>
        ) : null}
      </div>
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
    </form>
  );
}
