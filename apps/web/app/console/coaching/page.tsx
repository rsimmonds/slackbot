import { MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import { redirect } from 'next/navigation';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { coachingQueue } from '@/lib/billing/concierge';
import { CoachForm } from './CoachForm';

export const metadata = { title: 'Coaching' };

/** Concierge coaching queue for talent partners. Candidates are shown only by their request. */
export default async function CoachingQueuePage() {
  const viewer = await requireArea('staff');
  if (!viewer.roles.some((r) => r === 'talent_partner' || r === 'admin')) redirect('/console');
  const queue = await coachingQueue(viewer);
  const waiting = queue.filter((q) => q.status === 'requested').length;

  return (
    <DashboardFrame
      eyebrow="Staff console · concierge"
      title={
        waiting ? `${waiting} ${waiting === 1 ? 'request' : 'requests'} waiting` : 'No one waiting'
      }
      lede="Concierge members asking for a person. Take a request, propose a time, and mark it done after the session. Topics are private to you and the candidate."
    >
      <MeshPanel className="col-span-12" eyebrow="Queue" title="Coaching requests">
        {queue.length === 0 ? (
          <EmptyState>Nothing waiting. Requests from concierge members arrive here.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line" aria-label="Coaching requests">
            {queue.map((r) => (
              <li key={r.id} className="grid gap-4 py-4 md:grid-cols-[1fr_auto]">
                <div className="flex flex-col gap-2">
                  <Status tone={r.status === 'scheduled' ? 'human' : 'neutral'}>
                    {r.status === 'scheduled' ? 'Scheduled' : 'Requested'}
                  </Status>
                  <p className="max-w-prose text-small text-text">{r.topic}</p>
                  <MonoLabel>
                    Asked {r.createdAt.toISOString().slice(0, 10)}
                    {r.scheduledAt
                      ? ` · session ${r.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`
                      : ''}
                  </MonoLabel>
                </div>
                <CoachForm
                  id={r.id}
                  status={r.status}
                  takenByMe={!!r.takenByMe}
                  taken={!!r.taken}
                />
              </li>
            ))}
          </ul>
        )}
      </MeshPanel>
    </DashboardFrame>
  );
}
