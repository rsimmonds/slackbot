import type { ReactNode } from 'react';
import { AreaShell } from '@/components/AreaShell';
import { getViewer } from '@/lib/auth';
import { publicNav } from '@/lib/nav';

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  return (
    <AreaShell area="public" nav={publicNav} viewer={viewer}>
      {children}
    </AreaShell>
  );
}

export const dynamic = 'force-dynamic';
