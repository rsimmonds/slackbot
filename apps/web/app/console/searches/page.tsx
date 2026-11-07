import { MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { isoDate, searchStatusText, searchStatusTone } from '@/components/searches/SearchParts';
import { requireArea } from '@/lib/auth';
import { listConsoleSearches } from '@/lib/searches/service';
import { planLabel } from '@/lib/searches/terms';

export const metadata = { title: 'Searches' };

export default async function ConsoleSearchesPage() {
  const viewer = await requireArea('staff');
  const canRun = viewer.roles.includes('talent_partner') || viewer.roles.includes('admin');
  if (!canRun) {
    return (
      <DashboardFrame
        eyebrow="Staff console"
        title="Searches"
        lede="Searches are run by talent partners."
      >
        <MeshPanel className="col-span-12">
          <EmptyState>Ask an admin if you need access.</EmptyState>
        </MeshPanel>
      </DashboardFrame>
    );
  }
  const rows = await listConsoleSearches(viewer);
  const unassigned = rows.filter((r) => !r.talentPartnerId && r.status !== 'closed').length;
  return (
    <DashboardFrame
      eyebrow="Staff console · searches"
      title={unassigned ? `${unassigned} waiting for a talent partner` : 'Searches'}
      lede="Paid searches. Take one, move it through each stage, and record the placement. Every decision is logged."
    >
      <MeshPanel className="col-span-12" eyebrow={`${rows.length} total`}>
        {rows.length === 0 ? (
          <EmptyState>No searches yet. Employers request them from confirmed mandates.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/console/searches/${s.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 py-4 hover:bg-concrete/30"
                >
                  <span className="flex flex-col gap-1">
                    <span className="text-small text-text">
                      {s.title} · {s.companyName}
                    </span>
                    <MonoLabel>
                      {planLabel[s.plan]} · {isoDate(s.createdAt)} ·{' '}
                      {s.talentPartnerId === viewer.id
                        ? 'yours'
                        : s.talentPartnerId
                          ? 'assigned'
                          : 'unassigned'}
                    </MonoLabel>
                  </span>
                  <Status tone={searchStatusTone[s.status]}>{searchStatusText[s.status]}</Status>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </MeshPanel>
    </DashboardFrame>
  );
}
