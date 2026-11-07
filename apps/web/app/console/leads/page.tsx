import { Button, DataCard, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { isEditorial } from '@/lib/editorial/access';
import { downloadsPerDay, listLeads } from '@/lib/report/console';
import { REPORT_TITLE } from '@/lib/report/data';

export const metadata = { title: 'Report leads' };

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function LeadsPage() {
  const viewer = await requireArea('staff');
  if (!isEditorial(viewer)) {
    return (
      <DashboardFrame eyebrow="Staff console · leads" title="Report leads are for editors.">
        <MeshPanel className="col-span-12">
          <EmptyState>Ask an editor or admin if you need this list.</EmptyState>
        </MeshPanel>
      </DashboardFrame>
    );
  }
  const [leads, perDay] = await Promise.all([listLeads(viewer), downloadsPerDay(viewer)]);
  const optedIn = leads.filter((l) => l.optedIn).length;
  const confirmed = leads.filter((l) => l.confirmed).length;
  const maxDay = Math.max(1, ...perDay.map((d) => d.n));

  return (
    <DashboardFrame
      eyebrow="Staff console · leads"
      title="Who asked for the report."
      lede={`Every request for ${REPORT_TITLE}. A lead is not a subscriber: only people who ticked the newsletter box and then confirmed by email receive the newsletter.`}
      aside={
        <Button asChild variant="secondary">
          <a href="/console/leads/export" download>
            Export CSV
          </a>
        </Button>
      }
    >
      <div className="col-span-12 grid gap-6 md:grid-cols-3">
        <DataCard value={String(leads.length)} label="Report requests" />
        <DataCard value={String(optedIn)} label="Asked for the newsletter" />
        <DataCard
          value={String(confirmed)}
          label="Confirmed subscribers"
          footnote="Double opt-in completed"
        />
      </div>

      <MeshPanel className="col-span-12" eyebrow="Last 30 days" title="Requests per day">
        {perDay.length ? (
          <div
            role="img"
            aria-label={`Requests per day: ${perDay.map((d) => `${d.day} ${d.n}`).join('; ')}`}
          >
            <ul aria-hidden className="flex flex-col gap-1">
              {perDay.map((d) => (
                <li key={d.day} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3">
                  <span className="numeric text-micro text-text-2">{d.day}</span>
                  <span
                    className="h-3 rounded-r-[4px] bg-text-2"
                    style={{ width: `${(d.n / maxDay) * 100}%` }}
                  />
                  <span className="numeric text-right text-micro text-text">{d.n}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState>No requests in the last 30 days.</EmptyState>
        )}
      </MeshPanel>

      <MeshPanel className="col-span-12" eyebrow="Leads" title="Most recent first">
        {leads.length ? (
          <div tabIndex={0} role="region" aria-label="Report leads" className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-small">
              <thead>
                <tr className="border-b border-line">
                  {['Requested', 'Email', 'Company', 'Role', 'Market', 'Newsletter'].map((h) => (
                    <th key={h} scope="col" className="label-mono py-2 pr-4 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-line">
                    <td className="numeric py-2 pr-4 text-text-2">{day(l.createdAt)}</td>
                    <td className="py-2 pr-4 text-text">{l.email ?? '—'}</td>
                    <td className="py-2 pr-4 text-text-2">{l.company ?? '—'}</td>
                    <td className="py-2 pr-4 text-text-2">{l.role ?? '—'}</td>
                    <td className="py-2 pr-4 text-text-2">{l.market ?? '—'}</td>
                    <td className="py-2 pr-4">
                      {l.optedIn ? (
                        <Status tone={l.confirmed ? 'good' : 'human'}>
                          {l.confirmed ? 'Confirmed' : 'Awaiting confirmation'}
                        </Status>
                      ) : (
                        <MonoLabel>Report only</MonoLabel>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>No one has requested the report yet.</EmptyState>
        )}
      </MeshPanel>
    </DashboardFrame>
  );
}
