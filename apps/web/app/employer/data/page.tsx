import { Button, MeshPanel, MonoLabel } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { apiAccess } from '@/lib/api-keys/keys';
import { requireArea } from '@/lib/auth';
import { licence } from '@/lib/intelligence/filters';

export const metadata = { title: 'Data exports', robots: { index: false } };

const datasets = [
  {
    id: 'moves',
    title: 'CMO moves',
    body: 'Every approved appointment, departure and promotion, with company, industry, market, effective date and public sources.',
  },
  {
    id: 'comp',
    title: 'Comp aggregates',
    body: 'p25, median and p75 of live listing ranges by level, market, currency and pay basis. Cells under five listings are withheld.',
  },
] as const;

export default async function EmployerDataPage() {
  const viewer = await requireArea('employer');
  const access = await apiAccess(viewer);

  return (
    <DashboardFrame
      eyebrow="Employer · intelligence"
      title="Data exports"
      lede="Download the moves dataset and comp aggregates. Public data only, with where it came from on the first line."
      aside={
        <Button asChild variant="secondary" size="sm">
          <Link href="/employer/api">Data API</Link>
        </Button>
      }
    >
      {!access?.subscribed ? (
        <MeshPanel
          className="col-span-12"
          eyebrow="Not active"
          title="Exports come with the employer subscription"
        >
          <EmptyState>Your company does not have an active employer subscription.</EmptyState>
        </MeshPanel>
      ) : (
        <>
          {datasets.map((d) => (
            <MeshPanel
              key={d.id}
              className="col-span-12 md:col-span-6"
              eyebrow="Dataset"
              title={d.title}
            >
              <p className="text-small text-text-2">{d.body}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild variant="secondary" size="sm">
                  <a href={`/employer/data/export?dataset=${d.id}&format=csv`} download>
                    Download CSV
                  </a>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <a href={`/employer/data/export?dataset=${d.id}&format=json`} download>
                    Download JSON
                  </a>
                </Button>
              </div>
            </MeshPanel>
          ))}
          <MeshPanel className="col-span-12" eyebrow="Licence" title="How you may use it">
            <p className="text-small text-text-2">{licence}</p>
            <MonoLabel className="mt-4 block">
              Filters work as in the API, e.g. ?dataset=moves&amp;market=EU&amp;from=2026-01-01.
              Every export is logged.
            </MonoLabel>
          </MeshPanel>
        </>
      )}
    </DashboardFrame>
  );
}
