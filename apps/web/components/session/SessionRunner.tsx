'use client';

import {
  Button,
  Iris,
  MonoLabel,
  Resolve,
  SessionView,
  SignalLine,
  type IrisState,
} from '@cmobeat/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

/** What the server sends to start or resume a session (see lib/sessions/service.ts SessionView). */
export interface RunnerSession {
  id: string;
  ref: string;
  intro: string;
  question: string | null;
  index: number;
  total: number;
  done: boolean;
}

export interface SessionRunnerProps {
  session: RunnerSession;
  /** Where "Save and exit" goes. */
  exitHref: string;
  /** Copy for the finished state. */
  doneTitle?: string;
  doneBody?: string;
  completeLabel?: string;
}

type ServerEvent =
  | { type: 'thinking' }
  | { type: 'token'; text: string }
  | { type: 'question'; text: string; index: number; total: number; followUp: boolean }
  | { type: 'done'; index: number; total: number; complete: boolean }
  | { type: 'error'; message: string; status: number };

/** Split a question into lines at sentence ends, for the line-by-line Resolve. */
export const toLines = (q: string) =>
  q
    .split(/(?<=[.?!])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Parse a chunk of an SSE stream; returns complete events and the unconsumed remainder. */
export function parseSse(buffer: string): { events: ServerEvent[]; rest: string } {
  const events: ServerEvent[] = [];
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (data) events.push(JSON.parse(data) as ServerEvent);
  }
  return { events, rest };
}

/**
 * Runs an interview in the Session View. The Iris follows the conversation: idle → listening while
 * the person types → thinking once they submit → speaking while the next question streams in.
 */
export function SessionRunner({
  session,
  exitHref,
  doneTitle = 'That is everything I need.',
  doneBody = 'I will draft the document now. You can edit every line before anything is shared.',
  completeLabel = 'Draft it',
}: SessionRunnerProps) {
  const router = useRouter();
  const [question, setQuestion] = useState(session.question ?? '');
  const [index, setIndex] = useState(Math.max(1, session.index));
  const [done, setDone] = useState(session.done);
  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'speaking'>('idle');
  const [level, setLevel] = useState(0.5);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const lastToken = useRef(0);
  const intro = useRef(session.index <= 1 ? session.intro : null);

  const irisState: IrisState =
    phase === 'thinking'
      ? 'thinking'
      : phase === 'speaking'
        ? 'speaking'
        : value
          ? 'listening'
          : 'idle';

  const submit = useCallback(
    async (answer: string) => {
      setError(null);
      setPhase('thinking');
      intro.current = null;
      let res: Response;
      try {
        res = await fetch(`/api/sessions/${session.id}/answer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ answer }),
        });
      } catch {
        setPhase('idle');
        setError('No connection. Your answer is still here; try again.');
        return;
      }
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setPhase('idle');
        if (res.status === 409) router.refresh();
        setError(body.error ?? 'Something went wrong. Try again.');
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      let streamed = '';
      let answered = false;
      for (;;) {
        const { value: chunk, done: finished } = await reader.read();
        if (finished) break;
        const parsed = parseSse(buffer + chunk);
        buffer = parsed.rest;
        for (const ev of parsed.events) {
          if (ev.type === 'token') {
            if (!answered) {
              answered = true;
              setValue('');
            }
            const now = performance.now();
            const gap = lastToken.current ? now - lastToken.current : 120;
            lastToken.current = now;
            // Faster tokens → brighter core.
            setLevel((l) => l * 0.6 + Math.max(0.2, Math.min(1, 1 - gap / 240)) * 0.4);
            streamed += ev.text;
            setPhase('speaking');
            setQuestion(streamed);
            setIndex((i) => (streamed === ev.text ? i + 1 : i));
          } else if (ev.type === 'question') {
            setQuestion(ev.text);
            setIndex(ev.index);
          } else if (ev.type === 'done') {
            setValue('');
            setDone(true);
          } else if (ev.type === 'error') {
            setError(ev.message);
            if (ev.status === 409) router.refresh();
          }
        }
      }
      lastToken.current = 0;
      setPhase('idle');
    },
    [router, session.id],
  );

  const complete = async () => {
    setCompleting(true);
    setError(null);
    const res = await fetch(`/api/sessions/${session.id}/complete`, { method: 'POST' });
    const body = (await res.json().catch(() => ({}))) as {
      data?: { redirect: string };
      error?: string;
    };
    if (res.ok && body.data) router.push(body.data.redirect);
    else {
      setCompleting(false);
      setError(body.error ?? 'Could not finish the session. Try again.');
    }
  };

  if (done) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-10 overflow-hidden bg-bg px-6 py-24 text-text">
        <div aria-hidden className="volumetric" />
        <Iris state={completing ? 'thinking' : 'idle'} size={88} />
        <div className="relative flex max-w-2xl flex-col items-center gap-6 text-center">
          <Resolve as="h1" lines={[doneTitle]} className="font-serif text-h2 md:text-h1" />
          <p className="text-body text-text-2">{doneBody}</p>
          <Button variant="machine" size="lg" onClick={complete} disabled={completing}>
            {completeLabel}
          </Button>
          {completing ? <SignalLine label="Drafting" className="w-48" /> : null}
          {error ? (
            <p role="alert" className="text-small text-critical-ink">
              {error}
            </p>
          ) : null}
        </div>
        <MonoLabel className="absolute inset-x-6 top-6">Session {session.ref}</MonoLabel>
      </div>
    );
  }

  return (
    <div aria-busy={phase !== 'idle'}>
      <SessionView
        sessionId={session.ref}
        index={index}
        total={session.total}
        question={phase === 'speaking' ? [question] : toLines(question)}
        questionKey={index}
        irisState={irisState}
        irisLevel={level}
        value={value}
        onChange={setValue}
        onSubmit={submit}
        busy={phase !== 'idle'}
        systemNote={intro.current ?? undefined}
        error={error ?? undefined}
        onExit={() => router.push(exitHref)}
      />
    </div>
  );
}
