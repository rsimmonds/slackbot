import Link from 'next/link';
import { MeshPanel, Status } from '@cmobeat/ui';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';

export const metadata = { title: 'Account' };

export default async function AccountPage() {
  const viewer = await requireArea('reader');
  return (
    <DashboardFrame
      eyebrow="Reader"
      title={`Welcome, ${viewer.name.split(' ')[0]}.`}
      lede="Your newsletter, saved searches and data rights live here."
    >
      <MeshPanel
        className="col-span-12 md:col-span-6"
        eyebrow="Newsletter"
        title="The Beat"
        actions={<Status>Not subscribed</Status>}
      >
        <EmptyState>
          Weekly. CMO moves, interviews and comp data. Subscriptions open in Phase 1.
        </EmptyState>
      </MeshPanel>
      <MeshPanel className="col-span-12 md:col-span-6" eyebrow="Jobs" title="Saved searches">
        <EmptyState>
          Get an email when a new role matches your filters.{' '}
          <Link href="/account/searches" className="text-text underline underline-offset-4">
            Manage saved searches
          </Link>
        </EmptyState>
      </MeshPanel>
      <MeshPanel className="col-span-12" eyebrow="Privacy" title="Your data">
        <EmptyState>
          Export or permanently delete your data at any time. Self-serve tools arrive in Phase 2.
        </EmptyState>
      </MeshPanel>
    </DashboardFrame>
  );
}
