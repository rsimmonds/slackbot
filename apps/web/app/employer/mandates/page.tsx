import { Button, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { employerCompany } from '@/lib/jobs/posting';
import { listBuilderMandates } from '@/lib/mandates/document';
import { compRange, levelLabel } from '@/lib/mandates/labels';

export const metadata = { title: 'Mandates' };

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function MandatesPage() {
  const viewer = await requireArea('employer');
  const company = await asViewer(viewer, (tx) => employerCompany(tx, viewer.id));
  const data = company
    ? await listBuilderMandates(viewer, company.id)
    : { mandates: [], sessions: [] };

  return (
    <DashboardFrame
      eyebrow={company ? `Mandates · ${company.name}` : 'Mandates'}
      title="The seat, defined."
      lede="Each mandate comes from a short session with your CEO or a board member. You edit and confirm every line."
      aside={
        <Button asChild variant="human">
          <Link href="/employer/mandates/new">Start a mandate session</Link>
        </Button>
      }
    >
      {data.sessions.length ? (
        <MeshPanel className="col-span-12" eyebrow="In progress" title="Sessions you can resume">
          <ul className="flex flex-col divide-y divide-line">
            {data.sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <span className="flex flex-col gap-1">
                  <span className="text-small text-text">Session MB-{s.ref.slice(0, 4)}</span>
                  <MonoLabel>
                    Question {s.questionIndex} of {s.maxQuestions} · saved {day(s.updatedAt)}
                  </MonoLabel>
                </span>
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/employer/mandates/session/${s.id}`}>Resume</Link>
                </Button>
              </li>
            ))}
          </ul>
        </MeshPanel>
      ) : null}

      <MeshPanel
        className="col-span-12"
        eyebrow="Mandates"
        title={
          data.mandates.length
            ? `${data.mandates.length} mandate${data.mandates.length === 1 ? '' : 's'}`
            : 'No mandates yet'
        }
      >
        {data.mandates.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {data.mandates.map((m) => {
              const comp = compRange(m.doc.compMin, m.doc.compMax, m.doc.currency, m.doc.compBasis);
              return (
                <li key={m.id}>
                  <Link
                    href={`/employer/mandates/${m.id}`}
                    className="flex flex-wrap items-center justify-between gap-4 py-4 hover:bg-concrete/30"
                  >
                    <span className="flex flex-col gap-1">
                      <span className="font-serif text-h4 text-text">{m.doc.title}</span>
                      <MonoLabel>
                        {levelLabel[m.doc.level]} · reports to {m.doc.reportingLine || '—'}
                        {comp ? ` · ${comp}` : ''}
                      </MonoLabel>
                    </span>
                    {m.confirmedAt ? (
                      <Status tone="human">Confirmed {day(m.confirmedAt)}</Status>
                    ) : (
                      <Status tone="machine">Draft · needs your review</Status>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>
            A session takes about twenty minutes. You will get a mandate, a 90-day scorecard, a comp
            benchmark from real listings and an interview plan.
          </EmptyState>
        )}
      </MeshPanel>
    </DashboardFrame>
  );
}
