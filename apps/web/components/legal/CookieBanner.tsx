'use client';

import { Button } from '@cmobeat/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useSyncExternalStore, useTransition } from 'react';
import { consentCookieString } from '@/lib/consent/shared';

const noopSubscribe = () => () => {};

/**
 * Consent banner. Shown until the visitor chooses. Decline is exactly as prominent as Accept,
 * nothing optional loads before a yes, and Global Privacy Control counts as a no (no banner).
 * It sits at the end of the page in tab order and never traps or steals focus.
 */
export function CookieBanner({ decided }: { decided: boolean }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(decided);
  const [, start] = useTransition();
  // GPC can be on in the browser without the header reaching us (e.g. extensions): honour both.
  const gpc = useSyncExternalStore(
    noopSubscribe,
    () => !!(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl,
    () => false,
  );

  const pathname = usePathname();

  // The cookie settings page has the same choice in full; don't cover it.
  if (hidden || gpc || pathname === '/legal/cookies') return null;

  const choose = (analytics: boolean) => {
    document.cookie = consentCookieString(analytics, location.protocol === 'https:');
    setHidden(true);
    start(() => router.refresh());
  };

  return (
    <section
      aria-label="Cookie choices"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-panel border border-line-strong bg-surface-raised p-5 md:inset-x-8"
      style={{ background: 'var(--surface-raised)' }}
    >
      <p className="text-small text-text">
        We use only the cookies the site needs to work. With your permission we&apos;d also measure
        which pages are read, without ads and without selling anything.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => choose(false)}>
          Decline analytics
        </Button>
        <Button variant="secondary" size="sm" onClick={() => choose(true)}>
          Accept analytics
        </Button>
        <Link
          href="/legal/cookies"
          className="text-small text-text-2 underline underline-offset-4 hover:text-text"
        >
          Details
        </Link>
      </div>
    </section>
  );
}
