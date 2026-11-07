'use client';

/**
 * PLACEHOLDER. The SESSIONS workstream owns this component (streaming Session View, Iris states,
 * resume). This stand-in exists only so the candidate interview page builds in the PROFILE
 * workstream; keep SESSIONS' version at merge.
 */
import { Button, Iris, MonoLabel } from '@cmobeat/ui';
import Link from 'next/link';

export interface SessionRunnerProps {
  sessionId: string;
  completeHref: string;
}

export function SessionRunner({ sessionId, completeHref }: SessionRunnerProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <Iris state="idle" size={72} />
      <MonoLabel>Session {sessionId.slice(0, 8)}</MonoLabel>
      <p className="max-w-md text-body text-text-2">The interview opens here.</p>
      <Button asChild variant="secondary">
        <Link href={completeHref}>Review what you have so far</Link>
      </Button>
    </div>
  );
}
