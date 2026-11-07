import type { ReactNode } from 'react';
import { resolveTheme } from '@/lib/theme';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { theme } = await resolveTheme('reader');
  return (
    <div
      data-theme={theme}
      className="grain relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-16"
    >
      <div aria-hidden className="volumetric" />
      <div className="relative w-full max-w-lg">{children}</div>
    </div>
  );
}

export const dynamic = 'force-dynamic';
