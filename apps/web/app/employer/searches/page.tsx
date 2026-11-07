import { MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { isoDate, searchStatusText, searchStatusTone } from '@/components/searches/SearchParts';
import { requireArea } from '@/lib/auth';
import { listEmployerSearches } from '@/lib/searches/service';
import { planLabel } from '@/lib/searches/terms';

export const metadata = { title: 'Searches' };

export default async function EmployerSearchesPage() {
  const viewer = await requireArea('employer');
  const rows = await listEmployerSearches(viewer);
  return (
    <DashboardFrame
      eyebrow="Employer · searches"
      title="Searches"
      lede="Paid searches run by a talent partner. Start one from a confirmed mandate."
    >
      <MeshPanel
        className="col-span-12"
        eyebrow={`${rows.length} ${rows.length === 1 ? 'search' : 'searches'}`}
      >
        {rows.length === 0 ? (
          <EmptyState>
            No searches yet. Open a confirmed mandate and choose “Request a search”.{' '}
            <Link href="/employer/mandates" className="underline underline-offset-4">
              Your mandates
            </Link>
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/employer/searches/${s.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 py-4 hover:bg-concrete/30"
                >
                  <span className="flex flex-col gap-1">
                    <span className="text-small text-text">{s.title}</span>
                    <MonoLabel>
                      {planLabel[s.plan]} · requested {isoDate(s.createdAt)}
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
