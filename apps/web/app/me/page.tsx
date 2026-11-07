import { Button, Iris, MeshPanel, Status } from '@cmobeat/ui';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';

export const metadata = { title: 'Your profile' };

export default async function CandidateHome() {
  await requireArea('candidate');
  return (
    <DashboardFrame
      eyebrow="Candidate · private"
      title="Your profile is visible to no one."
      lede="You decide who sees it. Build a proof-of-outcomes profile, then choose hidden, anonymous matching, or open."
      aside={<Iris state="idle" size={72} />}
    >
      <MeshPanel
        className="col-span-12 lg:col-span-7"
        eyebrow="Profile interview"
        title="Proof of outcomes"
        actions={<Status>Not started</Status>}
      >
        <EmptyState>
          A one-question-at-a-time interview about results, teams you built, and your ideal next
          mandate. You approve every line. Opens in Phase 2.
        </EmptyState>
        <div className="mt-6">
          <Button variant="machine" disabled>
            Start interview
          </Button>
        </div>
      </MeshPanel>
      <MeshPanel
        className="col-span-12 lg:col-span-5"
        eyebrow="Visibility"
        title="Hidden"
        actions={<Status tone="human">Your choice</Status>}
      >
        <EmptyState>
          Hidden by default. Your current employer is blocked automatically when you add it.
        </EmptyState>
      </MeshPanel>
      <MeshPanel className="col-span-12" eyebrow="Matches" title="Nothing yet">
        <EmptyState>
          When there are matches, they appear here anonymized, with the reasons. A human reviews
          every match before anyone is contacted.
        </EmptyState>
      </MeshPanel>
    </DashboardFrame>
  );
}
