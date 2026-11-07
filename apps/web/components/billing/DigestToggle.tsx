'use client';

import { Button, Status } from '@cmobeat/ui';
import { useState, useTransition } from 'react';
import { digestAction } from './digest-actions';

/** Weekly career digest: off by default; one click on or off. */
export function DigestToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <Status tone={on ? 'human' : 'neutral'}>{on ? 'On · every Monday' : 'Off'}</Status>
      <div>
        <Button
          type="button"
          variant={on ? 'ghost' : 'human'}
          size="sm"
          disabled={pending}
          aria-pressed={on}
          onClick={() =>
            start(async () => {
              const r = await digestAction(!on);
              setOn(r.on);
              setError(r.error ?? null);
            })
          }
        >
          {on ? 'Turn off the digest' : 'Send me the weekly digest'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-small text-critical-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
