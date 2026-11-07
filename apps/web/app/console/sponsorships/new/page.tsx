import { MeshPanel } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { isAdmin } from '@/lib/sponsorships';
import { AdminOnly } from '../AdminOnly';
import { SponsorshipForm } from '../SponsorshipForm';

export const metadata = { title: 'Book a sponsorship' };

export default async function NewSponsorshipPage() {
  const viewer = await requireArea('staff');
  if (!isAdmin(viewer)) return <AdminOnly />;
  return (
    <DashboardFrame
      eyebrow="Sponsorships · new"
      title="Book a sponsorship"
      lede="It shows on the chosen placement from the start date to the end date, labelled Sponsored."
      aside={
        <Link href="/console/sponsorships" className="label-mono hover:text-text">
          ← All sponsorships
        </Link>
      }
    >
      <MeshPanel className="col-span-12 lg:col-span-9">
        <SponsorshipForm id={null} />
      </MeshPanel>
    </DashboardFrame>
  );
}
