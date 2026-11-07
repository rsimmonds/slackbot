import { Button, DataCard, MeshPanel, Status } from '@cmobeat/ui';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { companyForEmployer } from '@/lib/users';

export const metadata = { title: 'Employer' };

export default async function EmployerHome() {
  const viewer = await requireArea('employer');
  const company = await companyForEmployer(viewer.id);
  return (
    <DashboardFrame
      eyebrow={company ? `Employer · ${company}` : 'Employer'}
      title="Define the seat before you fill it."
      lede="Start with the mandate. The listing, the shortlist and the interview plan follow from it."
    >
      <MeshPanel
        className="col-span-12 lg:col-span-8"
        eyebrow="Mandate Builder"
        title="No mandates yet"
        actions={<Status>Phase 2</Status>}
      >
        <EmptyState>
          A 15-question session with your CEO or board member produces a mandate, a 90-day
          scorecard, a comp benchmark and an interview plan.
        </EmptyState>
        <div className="mt-6 flex gap-3">
          <Button variant="machine" disabled>
            Start a session
          </Button>
          <Button variant="secondary" disabled>
            Post a job
          </Button>
        </div>
      </MeshPanel>
      <div className="col-span-12 grid gap-6 lg:col-span-4">
        <DataCard value="0" label="Live listings" />
        <DataCard value="0" label="Active searches" />
      </div>
      <MeshPanel className="col-span-12" eyebrow="Searches" title="Shortlists">
        <EmptyState>
          Approved matches appear here anonymized. Identities are revealed only with the
          candidate&apos;s consent.
        </EmptyState>
      </MeshPanel>
    </DashboardFrame>
  );
}
