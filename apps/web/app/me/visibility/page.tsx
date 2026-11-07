import { MeshPanel, Status } from '@cmobeat/ui';
import { DashboardFrame } from '@/components/Dashboard';
import { BlocklistManager, VisibilityControl } from '@/components/profile/VisibilityControl';
import { requireArea } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { ensureProfile } from '@/lib/profile/profile';
import { listBlocklist, visibilityTerms } from '@/lib/profile/visibility';

export const metadata = { title: 'Visibility', robots: { index: false } };

export default async function VisibilityPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const viewer = await requireArea('candidate');
  const { saved } = await searchParams;
  const profile = await asViewer(viewer, (tx) => ensureProfile(tx, viewer));
  const blocklist = await listBlocklist(viewer);

  return (
    <DashboardFrame
      eyebrow="Candidate · private"
      title={
        profile.visibility === 'hidden'
          ? 'Your profile is visible to no one.'
          : 'You decide who sees it.'
      }
      lede="Choose who can see your profile, and which companies can never see it, whatever you choose."
      aside={saved ? <Status tone="human">Profile saved</Status> : undefined}
    >
      <MeshPanel className="col-span-12" eyebrow="Visibility" title="Who can see your profile">
        <VisibilityControl current={profile.visibility} terms={visibilityTerms} />
      </MeshPanel>
      <MeshPanel
        className="col-span-12 lg:col-span-8"
        eyebrow="Blocklist"
        title="Companies that can never see you"
      >
        <p className="mb-6 text-small text-text-2">
          Blocked companies never appear in any match involving you. Your current employer is
          blocked automatically and stays blocked while you work there.
        </p>
        <BlocklistManager initial={blocklist} />
      </MeshPanel>
    </DashboardFrame>
  );
}
