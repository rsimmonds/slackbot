import type { ReactNode } from 'react';
import { resolveTheme } from '@/lib/theme';

/**
 * Full-screen interviews (Session View). No header or footer: one question, nothing else.
 * Retreat theme by default, like every private area. Each page checks its own role.
 */
export default async function SessionLayout({ children }: { children: ReactNode }) {
  const { theme } = await resolveTheme('employer');
  return (
    <div data-theme={theme} data-area="session" className="grain relative min-h-dvh">
      {children}
    </div>
  );
}

export const dynamic = 'force-dynamic';
