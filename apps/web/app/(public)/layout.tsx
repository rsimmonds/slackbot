import type { ReactNode } from 'react';
import { AreaShell } from '@/components/AreaShell';
import { getViewer } from '@/lib/auth';

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  return (
    <AreaShell
      area="public"
      nav={viewer ? [{ href: '/dashboard', label: 'Dashboard' }] : []}
      viewer={viewer}
    >
      {children}
    </AreaShell>
  );
}

export const dynamic = 'force-dynamic';
