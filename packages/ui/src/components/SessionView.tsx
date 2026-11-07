'use client';

import { useId, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';
import { Iris, type IrisState } from './Iris';
import { Resolve } from './Resolve';
import { SignalLine } from './SignalLine';

export interface SessionViewProps {
  sessionId: string;
  index: number;
  total: number;
  /** The current question. Lines resolve in one by one. */
  question: string[];
  irisState: IrisState;
  irisLevel?: number;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  /** Optional system line under the question, e.g. "Reading your mandate. 14 signals found." */
  systemNote?: ReactNode;
  busy?: boolean;
  onExit?: () => void;
  placeholder?: string;
  className?: string;
}

/**
 * A full-screen, one-question-at-a-time interview. The Iris at top, the question in large
 * Instrument Serif, one answer field, and mono metadata in the corners.
 */
export function SessionView({
  sessionId,
  index,
  total,
  question,
  irisState,
  irisLevel,
  value,
  onChange,
  onSubmit,
  systemNote,
  busy,
  onExit,
  placeholder = 'Take your time.',
  className,
}: SessionViewProps) {
  const fieldId = useId();
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!busy && value.trim()) onSubmit(value.trim());
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
  };

  return (
    <div
      className={cn('relative flex min-h-dvh flex-col overflow-hidden bg-bg text-text', className)}
    >
      <div aria-hidden className="volumetric" />

      <div className="label-mono pointer-events-none absolute inset-x-6 top-6 flex justify-between">
        <span>Session {sessionId}</span>
        <span>
          Question {index} of {total}
        </span>
      </div>

      <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-10 px-6 py-24">
        <Iris state={irisState} level={irisLevel} size={88} />
        <form onSubmit={submit} className="flex w-full flex-col gap-8">
          <label htmlFor={fieldId} className="sr-only">
            {question.join(' ')}
          </label>
          <Resolve
            key={`${index}-${question[0] ?? ''}`}
            as="h1"
            lines={question}
            className="text-center font-serif text-h2 text-text md:text-h1"
          />
          {systemNote ? (
            <p className="label-mono text-center text-synapse-ink">{systemNote}</p>
          ) : null}
          <textarea
            id={fieldId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKey}
            rows={4}
            disabled={busy}
            placeholder={placeholder}
            className={cn(
              'w-full resize-none border-0 border-b border-line bg-transparent px-0 py-3 text-h4 text-text',
              'placeholder:text-text-3 focus:border-synapse focus:shadow-none focus:outline-none',
              'transition-[border-color] duration-[240ms] ease-calm',
            )}
          />
          <div className="flex items-center justify-between gap-4">
            <span className="label-mono">⌘ Enter to continue</span>
            <Button type="submit" variant="primary" disabled={busy || !value.trim()}>
              Continue
            </Button>
          </div>
          {busy ? <SignalLine label="Composing the next question" /> : null}
        </form>
      </main>

      <div className="label-mono absolute inset-x-6 bottom-6 flex items-end justify-between">
        <span className="inline-flex items-center gap-2">
          <svg aria-hidden width="10" height="12" viewBox="0 0 10 12" className="text-text-3">
            <rect x="1" y="5" width="8" height="6" rx="1" fill="none" stroke="currentColor" />
            <path d="M3 5V3.5a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" />
          </svg>
          Encrypted
        </span>
        {onExit ? (
          <button type="button" onClick={onExit} className="label-mono hover:text-text">
            Save and exit
          </button>
        ) : (
          <span>Saved as you go</span>
        )}
      </div>
    </div>
  );
}
