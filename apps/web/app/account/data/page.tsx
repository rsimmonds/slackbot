import { MeshPanel } from '@cmobeat/ui';
import { DashboardFrame } from '@/components/Dashboard';
import { DeleteControl, ExportControl } from '@/components/profile/DataRights';
import { requireArea } from '@/lib/auth';
import { DELETE_GRACE_DAYS, latestExport, myDataRequests } from '@/lib/data-rights';
import { signedFileUrl } from '@/lib/storage/signed-url';

export const metadata = { title: 'Your data', robots: { index: false } };

export default async function DataRightsPage() {
  const viewer = await requireArea('reader');
  const [requests, latest] = await Promise.all([myDataRequests(viewer), latestExport(viewer)]);
  const pendingExport = requests.some((r) => r.kind === 'export' && r.status === 'pending');
  const pendingDelete = requests.find((r) => r.kind === 'delete' && r.status === 'pending');

  return (
    <DashboardFrame
      eyebrow="Account · data rights"
      title="Your data, on your terms."
      lede="Download everything we hold about you, or delete it permanently. Both work the same for every account."
    >
      <MeshPanel
        className="col-span-12 lg:col-span-6"
        eyebrow="Export"
        title="A copy of everything"
      >
        <p className="mb-4 text-small text-text-2">
          One file with your account, profile, interview answers, consents, applications, saved
          searches and activity, decrypted for you. Ready within minutes; we email you when it is.
        </p>
        <ExportControl
          pending={pendingExport}
          latest={
            latest
              ? {
                  createdAt: latest.createdAt.toISOString(),
                  downloadUrl: signedFileUrl(latest.id, viewer.id),
                }
              : null
          }
        />
      </MeshPanel>
      <MeshPanel className="col-span-12 lg:col-span-6" eyebrow="Delete" title="Delete my account">
        <DeleteControl
          pending={
            pendingDelete
              ? {
                  createdAt: pendingDelete.createdAt.toISOString(),
                  graceEndsAt: new Date(
                    pendingDelete.createdAt.getTime() + DELETE_GRACE_DAYS * 86_400_000,
                  ).toISOString(),
                  dueAt: pendingDelete.dueAt.toISOString(),
                }
              : null
          }
        />
      </MeshPanel>
    </DashboardFrame>
  );
}
