import type { ReactNode } from 'react';
import { AreaShell } from '@/components/AreaShell';
import { requireArea } from '@/lib/auth';
import { readerNav } from '@/lib/nav';

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const viewer = await requireArea('reader');
  return (
    <AreaShell area="reader" viewer={viewer} nav={readerNav}>
      {children}
    </AreaShell>
  );
}

// Private areas are always rendered per request, for the signed-in viewer.
export const dynamic = 'force-dynamic';
