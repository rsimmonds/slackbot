import type { ReactNode } from 'react';
import { AreaShell } from '@/components/AreaShell';
import { requireArea } from '@/lib/auth';
import { staffNav } from '@/lib/nav';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const viewer = await requireArea('staff');
  return (
    <AreaShell area="staff" viewer={viewer} nav={staffNav}>
      {children}
    </AreaShell>
  );
}

// Private areas are always rendered per request, for the signed-in viewer.
export const dynamic = 'force-dynamic';
