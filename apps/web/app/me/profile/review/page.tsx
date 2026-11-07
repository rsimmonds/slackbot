import { Button, MeshPanel, MonoLabel } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { ReviewForm } from '@/components/profile/ReviewForm';
import { requireArea } from '@/lib/auth';
import { ProfileError } from '@/lib/profile/profile';
import { getProfileDraftForReview, type ReviewDraft } from '@/lib/profile/review';

export const metadata = { title: 'Review your profile', robots: { index: false } };

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const viewer = await requireArea('candidate');
  const { session = '' } = await searchParams;
  let draft: ReviewDraft | null = null;
  let problem: string | null = null;
  try {
    draft = await getProfileDraftForReview(viewer, session);
  } catch (e) {
    if (!(e instanceof ProfileError)) throw e;
    problem = e.message;
  }

  return (
    <DashboardFrame
      eyebrow={draft ? `Review · session ${draft.publicRef}` : 'Review'}
      title="Approve every line."
      lede="This is a draft from your answers. Nothing is saved until you approve, edit or remove each line. Your profile stays hidden until you choose otherwise."
    >
      <div className="col-span-12 lg:col-span-9">
        {draft ? (
          <>
            {draft.alreadySaved ? (
              <MonoLabel className="mb-4 block">
                You saved this session before. Saving again replaces your profile.
              </MonoLabel>
            ) : null}
            <ReviewForm sessionId={draft.sessionId} lines={draft.lines} scrubbed={draft.scrubbed} />
          </>
        ) : (
          <MeshPanel eyebrow="Nothing to review" title="This draft isn't available">
            <EmptyState>{problem ?? 'Session not found.'}</EmptyState>
            <div className="mt-6">
              <Button asChild variant="secondary">
                <Link href="/me">Back to your profile</Link>
              </Button>
            </div>
          </MeshPanel>
        )}
      </div>
    </DashboardFrame>
  );
}
