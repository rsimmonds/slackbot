import { MeshPanel } from '@cmobeat/ui';
import { DashboardFrame } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { ParseForm } from './ParseForm';

export const metadata = { title: 'Post a job' };

export default async function NewJobPage() {
  await requireArea('employer');
  return (
    <DashboardFrame
      eyebrow="Post a job · Step 1 of 3"
      title="Start with the description you have."
      lede="Read, then edit and confirm, then pay. A person reviews every listing before it goes live."
    >
      <MeshPanel className="col-span-12 lg:col-span-9">
        <ParseForm />
      </MeshPanel>
    </DashboardFrame>
  );
}
