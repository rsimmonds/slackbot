'use client';

import { Button, Status } from '@cmobeat/ui';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { consentCookieString, type Consent } from '@/lib/consent/shared';

/** Change your choice at any time. With GPC on, analytics stays off and the switch is locked. */
export function CookieSettings({ consent }: { consent: Consent }) {
  const router = useRouter();
  const [analytics, setAnalytics] = useState(consent.analytics);
  const [saved, setSaved] = useState(false);
  const [, start] = useTransition();
  const id = useId();

  const save = () => {
    document.cookie = consentCookieString(analytics, location.protocol === 'https:');
    setSaved(true);
    start(() => router.refresh());
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={analytics}
          disabled={consent.gpc}
          onChange={(e) => {
            setAnalytics(e.target.checked);
            setSaved(false);
          }}
          className="mt-1 size-4 accent-[var(--filament-ink)]"
        />
        <label htmlFor={id} className="flex flex-col gap-1">
          <span className="text-small text-text">Analytics</span>
          <span className="text-small text-text-2">
            Which pages are read and how long. No advertising, no cross-site tracking, and never any
            candidate data.
          </span>
        </label>
      </div>
      {consent.gpc ? (
        <p className="text-small text-text-2">
          Your browser sends Global Privacy Control, so analytics stays off.
        </p>
      ) : null}
      <div className="flex items-center gap-4">
        <Button variant="secondary" onClick={save} disabled={consent.gpc}>
          Save choice
        </Button>
        {saved ? (
          <span role="status">
            <Status tone="human">Saved</Status>
          </span>
        ) : null}
      </div>
    </div>
  );
}
