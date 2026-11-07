'use client';

import { Button, cn, MonoLabel, Textarea } from '@cmobeat/ui';
import { useActionState, useEffect, useId, useRef } from 'react';

export interface ThreadMessage {
  id: string;
  mine: boolean;
  body: string;
  at: string;
}

type State = { error?: string; done?: boolean };

/** A private thread between the two sides of a revealed match. Bodies are stored encrypted. */
export function MessageThread({
  messages,
  counterpart,
  send,
}: {
  messages: ThreadMessage[];
  counterpart: string;
  send: (prev: State, form: FormData) => Promise<State>;
}) {
  const [state, action, pending] = useActionState<State, FormData>(send, {});
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (state.done) form.current?.reset();
  }, [state]);

  return (
    <div className="flex flex-col gap-6">
      {messages.length === 0 ? (
        <p className="text-small text-text-3">No messages yet. Say hello.</p>
      ) : (
        <ol className="flex flex-col gap-4" aria-label="Messages">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                'flex max-w-[80%] flex-col gap-1 rounded-panel border border-line p-4',
                m.mine ? 'self-end bg-surface-raised' : 'self-start bg-surface',
              )}
            >
              <MonoLabel>
                {m.mine ? 'You' : counterpart} · {m.at.slice(0, 16).replace('T', ' ')}
              </MonoLabel>
              <p className="text-small whitespace-pre-wrap text-text">{m.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form ref={form} action={action} className="flex flex-col gap-3">
        <label htmlFor={id} className="label-mono">
          Message
        </label>
        <Textarea id={id} name="body" rows={3} required maxLength={4000} />
        {state.error ? (
          <p role="alert" className="text-small text-critical-ink">
            {state.error}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={pending}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
