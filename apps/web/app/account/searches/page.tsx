import { Button, MeshPanel, MonoLabel } from '@cmobeat/ui';
import Link from 'next/link';
import { removeSearch } from '@/app/(public)/jobs/actions';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { toQuery } from '@/lib/jobs/filters';
import { describeFilters } from '@/lib/jobs/format';
import { listSavedSearches } from '@/lib/jobs/saved-searches';

export const metadata = { title: 'Saved searches' };

export default async function SavedSearchesPage() {
  const viewer = await requireArea('reader');
  const searches = await asViewer(viewer, (tx) => listSavedSearches(tx, viewer.id));

  return (
    <DashboardFrame
      eyebrow="Account · Jobs"
      title="Saved searches"
      lede="We email you when a new role matches. Remove a search to stop its alerts."
    >
      <MeshPanel className="col-span-12" eyebrow={`${searches.length} saved`}>
        {searches.length === 0 ? (
          <EmptyState>
            No saved searches yet. Filter the{' '}
            <Link href="/jobs" className="text-text underline underline-offset-4">
              job board
            </Link>{' '}
            and choose Save search.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line border-t border-line">
            {searches.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/jobs${toQuery(s.query)}`}
                    className="text-body text-text hover:underline hover:underline-offset-4"
                  >
                    {s.name ?? describeFilters(s.query)}
                  </Link>
                  <MonoLabel>
                    {describeFilters(s.query)} · {s.alertFrequency} alerts
                  </MonoLabel>
                </div>
                <form action={removeSearch}>
                  <input type="hidden" name="id" value={s.id} />
                  <Button
                    type="submit"
                    size="sm"
                    variant="danger"
                    aria-label={`Remove ${s.name ?? 'saved search'}`}
                  >
                    Remove
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </MeshPanel>
    </DashboardFrame>
  );
}
