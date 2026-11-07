import { MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { teamFor } from '@/lib/billing/team';
import { InviteForm, RemoveButton, RevokeButton } from './TeamForms';

export const metadata = { title: 'Team' };

const seatLabel = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const;

export default async function TeamPage() {
  const viewer = await requireArea('employer');
  const team = await teamFor(viewer);
  const full = team.used >= team.limit;
  const subscribed = team.billing.subscription?.active ?? false;

  return (
    <DashboardFrame
      eyebrow={`Employer · ${team.billing.companyName}`}
      title="Your hiring team"
      lede="Everyone who can see your mandates, listings and shortlists. Candidate identities stay hidden from all of them until a candidate consents."
      aside={
        <div className="flex flex-col items-end gap-1">
          <span className="numeric text-h3 text-text">
            {team.used} / {team.limit}
          </span>
          <MonoLabel>Seats in use</MonoLabel>
        </div>
      }
    >
      <MeshPanel
        className="col-span-12 lg:col-span-7"
        eyebrow="Members"
        title={`${team.members.length} on the team`}
      >
        <ul className="flex flex-col divide-y divide-line" aria-label="Team members">
          {team.members.map((m) => (
            <li key={m.memberId} className="flex flex-wrap items-center justify-between gap-4 py-3">
              <span className="flex flex-col">
                <span className="text-small text-text">
                  {m.name}
                  {m.userId === viewer.id ? <span className="text-text-3"> · you</span> : null}
                </span>
                <span className="text-micro text-text-3">{m.email}</span>
              </span>
              <span className="flex items-center gap-4">
                <MonoLabel>{seatLabel[m.seatRole]}</MonoLabel>
                {team.canManage && m.userId !== viewer.id ? (
                  <RemoveButton memberId={m.memberId} name={m.name} />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </MeshPanel>

      <div className="col-span-12 flex flex-col gap-6 lg:col-span-5">
        {team.canManage ? (
          <MeshPanel eyebrow="Invite" title="Add a teammate">
            {full ? (
              <p className="mb-4 text-small text-text-2">
                All seats are in use.{' '}
                {subscribed ? (
                  'Add seats from billing, or remove someone first.'
                ) : (
                  <>
                    <Link
                      href="/employer/billing"
                      className="underline underline-offset-4 hover:text-text"
                    >
                      Subscribe
                    </Link>{' '}
                    for more seats.
                  </>
                )}
              </p>
            ) : null}
            <InviteForm disabled={full} />
          </MeshPanel>
        ) : (
          <MeshPanel eyebrow="Invite" title="Ask an admin">
            <EmptyState>Owners and admins invite teammates.</EmptyState>
          </MeshPanel>
        )}
        {team.canManage ? (
          <MeshPanel eyebrow="Pending" title="Invitations">
            {team.invites.length === 0 ? (
              <EmptyState>No invitations waiting.</EmptyState>
            ) : (
              <ul className="flex flex-col divide-y divide-line" aria-label="Pending invitations">
                {team.invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-4 py-3">
                    <span className="flex flex-col">
                      <span className="text-small text-text">{i.email}</span>
                      <span className="text-micro text-text-3">
                        {seatLabel[i.seatRole]} · expires {i.expiresAt.toISOString().slice(0, 10)}
                      </span>
                    </span>
                    <RevokeButton inviteId={i.id} email={i.email} />
                  </li>
                ))}
              </ul>
            )}
          </MeshPanel>
        ) : null}
        <Status tone={subscribed ? 'human' : 'neutral'}>
          {subscribed ? 'Subscription seats' : `Free plan · up to ${team.limit} seats`}
        </Status>
      </div>
    </DashboardFrame>
  );
}
