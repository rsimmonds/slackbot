import { Button, Input, MonoLabel, Status } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Select } from '@/components/form/Select';
import { FilterPanel } from '@/components/jobs/FilterPanel';
import { JobCard } from '@/components/jobs/JobCard';
import { SponsorSlot } from '@/components/sponsorships/SponsorSlot';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { hasFilters, parseFilters, toQuery } from '@/lib/jobs/filters';
import { describeFilters } from '@/lib/jobs/format';
import { jobFacets, searchJobs } from '@/lib/jobs/queries';
import { saveSearch } from './actions';

export const metadata: Metadata = {
  title: 'Jobs',
  description:
    'Curated CMO, VP Marketing, Chief Growth Officer and fractional CMO roles. Comp on every listing.',
  alternates: { canonical: '/jobs' },
};

export const dynamic = 'force-dynamic';

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const viewer = await getViewer();
  const [{ items, total, page, pages }, facets] = await asViewer(viewer, (tx) =>
    Promise.all([searchJobs(tx, filters), jobFacets(tx)]),
  );
  const query = toQuery(filters, { page: 1 }).replace(/^\?/, '');
  const saved = params.saved === '1';

  return (
    <main className="relative mx-auto max-w-[1280px] px-4 pt-12 pb-24 md:px-8 md:pt-16">
      <header className="grid grid-cols-12 gap-6">
        <div className="col-span-12 flex flex-col gap-4 md:col-span-8">
          <MonoLabel>Job board</MonoLabel>
          <h1 className="font-serif text-h2 text-text md:text-h1">
            Senior marketing roles, comp on every listing.
          </h1>
          <p className="max-w-2xl text-body text-text-2">
            CMO, VP Marketing, Chief Growth Officer and fractional roles. Each listing states the
            real mandate, who the role reports to, and the pay range.
          </p>
        </div>
      </header>

      <div className="mt-12 grid grid-cols-12 gap-8">
        <aside className="col-span-12 lg:col-span-3">
          <details className="group lg:hidden" open={hasFilters(filters)}>
            <summary className="label-mono mb-4 flex cursor-pointer list-none items-center justify-between rounded-control border border-line px-3 py-2.5">
              Filters{' '}
              <span aria-hidden className="text-text-3 group-open:rotate-180">
                ⌄
              </span>
            </summary>
            <FilterPanel filters={filters} facets={facets} />
          </details>
          <div className="hidden lg:block">
            <FilterPanel filters={filters} facets={facets} />
          </div>
        </aside>

        <section aria-label="Results" className="col-span-12 flex flex-col gap-6 lg:col-span-9">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
            <div className="flex flex-col gap-1">
              <MonoLabel>{describeFilters(filters)}</MonoLabel>
              <p className="numeric text-small text-text-2" aria-live="polite">
                {total} {total === 1 ? 'role' : 'roles'}
              </p>
            </div>
            {saved ? (
              <Status tone="good">Search saved. We&apos;ll email new matches.</Status>
            ) : viewer ? (
              <form action={saveSearch} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="query" value={query} />
                <Input
                  name="name"
                  aria-label="Search name"
                  required
                  maxLength={80}
                  defaultValue={describeFilters(filters).slice(0, 80)}
                  className="h-8 w-48 text-micro"
                />
                <Select
                  name="frequency"
                  aria-label="Alert frequency"
                  defaultValue="weekly"
                  className="h-8 w-28 text-micro"
                >
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                </Select>
                <Button type="submit" size="sm" variant="secondary">
                  Save search
                </Button>
              </form>
            ) : (
              <Link
                href={`/sign-in?next=${encodeURIComponent(`/jobs${toQuery(filters)}`)}`}
                className="text-small text-text-2 hover:text-text"
              >
                Sign in to save this search
              </Link>
            )}
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col gap-3 py-12">
              <p className="font-serif text-h3 text-text">No roles match these filters.</p>
              <p className="text-small text-text-2">
                Widen a filter, or save the search and we&apos;ll email you when one appears.
              </p>
            </div>
          ) : (
            <ol className="grid gap-4 md:grid-cols-2">
              {items.map((job) => (
                <li key={job.listingId}>
                  <JobCard job={job} />
                </li>
              ))}
            </ol>
          )}

          <SponsorSlot placement="jobs_index" />

          {pages > 1 ? (
            <nav
              aria-label="Pagination"
              className="flex items-center justify-between border-t border-line pt-6"
            >
              {page > 1 ? (
                <Link
                  href={`/jobs${toQuery(filters, { page: page - 1 })}`}
                  className="text-small text-text-2 hover:text-text"
                >
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="label-mono">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Link
                  href={`/jobs${toQuery(filters, { page: page + 1 })}`}
                  className="text-small text-text-2 hover:text-text"
                >
                  Next →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
