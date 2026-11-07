import { MeshPanel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardFrame } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { EditorialError } from '@/lib/editorial/access';
import { creativeSchema, getSponsorship, isAdmin, statusOf } from '@/lib/sponsorships';
import { AdminOnly } from '../AdminOnly';
import { SponsorshipForm } from '../SponsorshipForm';

export const metadata = { title: 'Edit sponsorship' };

export default async function EditSponsorshipPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireArea('staff');
  if (!isAdmin(viewer)) return <AdminOnly />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let row;
  try {
    row = await getSponsorship(viewer, id);
  } catch (e) {
    if (e instanceof EditorialError) notFound();
    throw e;
  }
  const creative = creativeSchema.partial().safeParse(row.creative);
  return (
    <DashboardFrame
      eyebrow="Sponsorships · edit"
      title={row.sponsorName}
      aside={
        <Link href="/console/sponsorships" className="label-mono hover:text-text">
          ← All sponsorships
        </Link>
      }
    >
      <div className="col-span-12">
        <Status>{statusOf(row)}</Status>
      </div>
      <MeshPanel className="col-span-12 lg:col-span-9">
        <SponsorshipForm
          id={row.id}
          initial={{
            sponsorName: row.sponsorName,
            placement: row.placement,
            creative: creative.success ? creative.data : {},
            startDate: row.startDate,
            endDate: row.endDate,
            amount: row.amount,
            currency: row.currency,
          }}
        />
      </MeshPanel>
    </DashboardFrame>
  );
}
