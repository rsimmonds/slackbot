import { Button, DataCard, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { apiAccess, listKeys, usageByDay } from '@/lib/api-keys/keys';
import { rateLimits } from '@/lib/api-keys/scopes';
import { requireArea } from '@/lib/auth';
import { revokeKeyAction } from './actions';
import { CreateKeyForm } from './CreateKeyForm';

export const metadata = { title: 'Data API', robots: { index: false } };

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');

export default async function EmployerApiPage() {
  const viewer = await requireArea('employer');
  const access = await apiAccess(viewer);
  const limits = rateLimits();

  if (!access?.subscribed) {
    return (
      <DashboardFrame
        eyebrow="Employer · data API"
        title="The data API comes with the employer subscription."
        lede="Subscribers pull CMO moves, live roles and comp aggregates into their own tools. Public data only: nothing about candidates is ever available."
      >
        <MeshPanel
          className="col-span-12 lg:col-span-8"
          eyebrow="Not active"
          title="No subscription"
        >
          <EmptyState>
            Your company does not have an active employer subscription, so keys can’t be created.
          </EmptyState>
          <div className="mt-6 flex gap-3">
            <Button asChild variant="secondary">
              <Link href="/developers">Read the API docs</Link>
            </Button>
          </div>
        </MeshPanel>
      </DashboardFrame>
    );
  }

  if (!access.isAdmin) {
    return (
      <DashboardFrame
        eyebrow={`Employer · ${access.companyName}`}
        title="Data API"
        lede="Your company’s owners and admins create and revoke API keys."
      >
        <MeshPanel className="col-span-12" eyebrow="Keys" title="Ask an admin">
          <EmptyState>
            Keys belong to the company, so only owners and admins manage them.
          </EmptyState>
        </MeshPanel>
      </DashboardFrame>
    );
  }

  const [keys, usage] = await Promise.all([listKeys(viewer), usageByDay(viewer)]);
  const active = keys.filter((k) => !k.revokedAt);
  const total30 = usage.reduce((n, u) => n + u.requests, 0);
  const peak = Math.max(1, ...usage.map((u) => u.requests));

  return (
    <DashboardFrame
      eyebrow={`Employer · ${access.companyName}`}
      title="Data API"
      lede="Read-only access to CMO moves, live roles and comp aggregates. Public data only: nothing about candidates is ever available."
      aside={
        <Button asChild variant="secondary" size="sm">
          <Link href="/developers">API docs</Link>
        </Button>
      }
    >
      <div className="col-span-12 grid gap-6 md:grid-cols-3">
        <DataCard value={String(active.length)} label="Active keys" />
        <DataCard value={total30.toLocaleString('en-US')} label="Requests, last 30 days" />
        <DataCard
          value={String(limits.perMinute)}
          label="Requests per minute, per key"
          footnote={`${limits.perDay.toLocaleString('en-US')} per day`}
        />
      </div>

      <MeshPanel className="col-span-12 lg:col-span-5" eyebrow="New key" title="Create a key">
        <CreateKeyForm />
      </MeshPanel>

      <MeshPanel className="col-span-12 lg:col-span-7" eyebrow="Keys" title="Your company’s keys">
        {keys.length === 0 ? (
          <EmptyState>No keys yet.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line" aria-label="API keys">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-small text-text">{k.name}</span>
                  <span className="numeric text-micro text-text-2">{k.prefix}…</span>
                  <MonoLabel>
                    {k.scopes.join(' · ')} · created {day(k.createdAt)} · last used{' '}
                    {day(k.lastUsedAt)}
                  </MonoLabel>
                </div>
                {k.revokedAt ? (
                  <Status tone="critical">Revoked {day(k.revokedAt)}</Status>
                ) : (
                  <form action={revokeKeyAction}>
                    <input type="hidden" name="id" value={k.id} />
                    <Button
                      type="submit"
                      variant="danger"
                      size="sm"
                      aria-label={`Revoke ${k.name}`}
                    >
                      Revoke
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </MeshPanel>

      <MeshPanel className="col-span-12" eyebrow="Usage" title="Requests per day, last 30 days">
        {usage.length === 0 ? (
          <EmptyState>No requests yet.</EmptyState>
        ) : (
          <table className="w-full text-small">
            <caption className="sr-only">Requests per day</caption>
            <thead>
              <tr className="label-mono text-left">
                <th scope="col" className="py-2 font-normal">
                  Day
                </th>
                <th scope="col" className="w-1/2 py-2 font-normal">
                  <span className="sr-only">Volume</span>
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Requests
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Rows
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Errors
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {usage.map((u) => (
                <tr key={u.day}>
                  <td className="numeric py-2 text-text-2">{u.day}</td>
                  <td className="py-2" aria-hidden>
                    <span
                      className="block h-1.5 rounded-full bg-text-3"
                      style={{ width: `${Math.max(2, (u.requests / peak) * 100)}%` }}
                    />
                  </td>
                  <td className="numeric py-2 text-right text-text">{u.requests}</td>
                  <td className="numeric py-2 text-right text-text-2">{u.rows}</td>
                  <td className="numeric py-2 text-right text-text-2">{u.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </MeshPanel>
    </DashboardFrame>
  );
}
