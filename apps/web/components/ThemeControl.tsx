'use client';

import { ThemeToggle, type ThemePreference } from '@cmobeat/ui';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function ThemeControl({ value, className }: { value: ThemePreference; className?: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <ThemeToggle
      className={className}
      value={value}
      onChange={(v) => {
        document.cookie = `cmob_theme=${v}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        start(() => router.refresh());
      }}
    />
  );
}
