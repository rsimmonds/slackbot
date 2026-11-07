import type { ReactNode } from 'react';
import { AreaShell } from '@/components/AreaShell';
import { requireArea } from '@/lib/auth';
import { candidateNav } from '@/lib/nav';

export default async function CandidateLayout({ children }: { children: ReactNode }) {
  const viewer = await requireArea('candidate');
  return (
    <AreaShell area="candidate" viewer={viewer} nav={candidateNav}>
      {children}
    </AreaShell>
  );
}

// Private areas are always rendered per request, for the signed-in viewer.
export const dynamic = 'force-dynamic';
