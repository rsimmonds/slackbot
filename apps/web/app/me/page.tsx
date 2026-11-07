import { Button, Iris, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { DigestToggle } from '@/components/billing/DigestToggle';
import { requireArea } from '@/lib/auth';
import { digestEnabled } from '@/lib/billing/digest';
import { hasActiveConcierge } from '@/lib/billing/status';
import { myMatches } from '@/lib/matches/candidate';
import { candidateOverview } from '@/lib/profile/profile';
import { visibilityTerms } from '@/lib/profile/visibility';

export const metadata = { title: 'Your profile' };

const fmt = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);

export default async function CandidateHome() {
  const viewer = await requireArea('candidate');
  const [o, matchList, digest, concierge] = await Promise.all([
    candidateOverview(viewer),
    myMatches(viewer),
    digestEnabled(viewer),
    hasActiveConcierge(viewer.id),
  ]);
  const matchCount = matchList.length;
  const introRequests = matchList.filter((m) => m.pendingRequestId).length;
  const hidden = o.visibility === 'hidden';
  const sessionToReview =
    o.lastSession && o.lastSession.status === 'complete' && !o.lastSession.profileId
      ? o.lastSession
      : null;

  const next = !o.aiNoticeAckAt
    ? {
        label: 'Read how AI is used, then begin',
        href: '/me/profile/start',
        note: 'Two minutes. Nothing is shared.',
      }
    : sessionToReview
      ? {
          label: 'Review your draft profile',
          href: `/me/profile/review?session=${sessionToReview.id}`,
          note: 'Approve, edit or remove every line.',
        }
      : o.lastSession && o.lastSession.status !== 'complete' && o.lastSession.status !== 'abandoned'
        ? {
            label: 'Resume your interview',
            href: `/me/interview/${o.lastSession.id}`,
            note: 'Your answers are saved as you go.',
          }
        : o.approvedOutcomes === 0
          ? {
              label: 'Begin your profile interview',
              href: '/me/profile/start',
              note: 'About 15 questions, one at a time.',
            }
          : {
              label: 'Choose who can see your profile',
              href: '/me/visibility',
              note: 'Hidden until you decide otherwise.',
            };

  return (
    <DashboardFrame
      eyebrow="Candidate · private"
      title={
        hidden
          ? 'Your profile is visible to no one.'
          : `Your profile: ${visibilityTerms[o.visibility].label.toLowerCase()}.`
      }
      lede={
        hidden
          ? 'You decide who sees it. Build a proof-of-outcomes profile, then choose hidden, anonymous matching, or open.'
          : visibilityTerms[o.visibility].summary
      }
      aside={<Iris state="idle" size={72} />}
    >
      <MeshPanel className="col-span-12" eyebrow="Next" title={next.label}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-small text-text-2">{next.note}</p>
          <Button asChild variant="human">
            <Link href={next.href}>Continue</Link>
          </Button>
        </div>
      </MeshPanel>

      <MeshPanel
        className="col-span-12 lg:col-span-7"
        eyebrow="Proof of outcomes"
        title={o.headline ?? 'Not built yet'}
        actions={
          o.approvedOutcomes ? (
            <Status tone="human" className="whitespace-nowrap">
              {o.approvedOutcomes} approved
            </Status>
          ) : (
            <Status>Not started</Status>
          )
        }
      >
        {o.approvedOutcomes ? (
          <p className="text-small text-text-2">
            Every line was approved by you. Run a new interview at any time to replace it.
          </p>
        ) : (
          <EmptyState>
            A one-question-at-a-time interview about results, teams you built, and your ideal next
            mandate. You approve every line before anything is saved.
          </EmptyState>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="machine">
            <Link href="/me/profile/start">
              {o.approvedOutcomes ? 'Start a new interview' : 'Start'}
            </Link>
          </Button>
        </div>
      </MeshPanel>

      <MeshPanel
        className="col-span-12 lg:col-span-5"
        eyebrow="Visibility"
        title={visibilityTerms[o.visibility].label}
        actions={<Status tone="human">Your choice</Status>}
      >
        <p className="text-small text-text-2">{visibilityTerms[o.visibility].summary}</p>
        <dl className="mt-6 grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <dt className="label-mono">Blocked companies</dt>
            <dd className="numeric text-h4 text-text">{o.blocklistCount}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="label-mono">Current employer</dt>
            <dd className="text-small text-text">{o.currentEmployer ?? 'Not set'}</dd>
          </div>
        </dl>
        <div className="mt-6">
          <Button asChild variant="secondary" size="sm">
            <Link href="/me/visibility">Visibility and blocklist</Link>
          </Button>
        </div>
      </MeshPanel>

      <MeshPanel
        className="col-span-12 md:col-span-6"
        eyebrow="Documents"
        title={o.uploads ? `${o.uploads} on file` : 'None uploaded'}
      >
        <p className="text-small text-text-2">
          Encrypted, and readable only by you. We remove contact details and personal attributes
          before the interviewer reads them.
        </p>
        {o.aiNoticeAckAt ? (
          <MonoLabel className="mt-4 block">AI notice read {fmt(o.aiNoticeAckAt)}</MonoLabel>
        ) : null}
      </MeshPanel>

      <MeshPanel className="col-span-12 md:col-span-6" eyebrow="Your data" title="Export or delete">
        <p className="text-small text-text-2">
          Download everything we hold about you, or delete it permanently.
        </p>
        <div className="mt-6">
          <Button asChild variant="ghost" size="sm">
            <Link href="/account/data">Data rights</Link>
          </Button>
        </div>
      </MeshPanel>

      <MeshPanel
        className="col-span-12"
        eyebrow="Matches"
        title={
          matchCount
            ? `${matchCount} match${matchCount === 1 ? '' : 'es'} approved by a person`
            : 'Nothing yet'
        }
        actions={
          introRequests ? (
            <Status tone="human">
              {introRequests} introduction request{introRequests === 1 ? '' : 's'}
            </Status>
          ) : null
        }
      >
        {matchCount ? (
          <Button asChild variant="secondary" size="sm">
            <Link href="/me/matches">See your matches</Link>
          </Button>
        ) : (
          <EmptyState>
            When there are matches, they appear here anonymized, with the reasons. A human reviews
            every match before anyone is contacted.
          </EmptyState>
        )}
      </MeshPanel>

      <section id="digest" className="col-span-12 md:col-span-6" aria-label="Career digest">
        <MeshPanel eyebrow="Career digest" title="New roles, weekly">
          <p className="mb-4 text-small text-text-2">
            Live roles that fit your ideal next mandate, and moves in your industries. Built inside{' '}
            CMO Beat; nothing about you is shared.
          </p>
          <DigestToggle initial={digest} />
        </MeshPanel>
      </section>
      <MeshPanel
        className="col-span-12 md:col-span-6"
        eyebrow="Concierge"
        title={concierge ? 'Coaching is on' : 'Coaching from a person'}
        actions={concierge ? <Status tone="human">Active</Status> : null}
      >
        <p className="text-small text-text-2">
          A talent partner to prepare for board interviews, offers and your next mandate.
        </p>
        <div className="mt-6">
          <Button asChild variant="secondary" size="sm">
            <Link href="/me/concierge">{concierge ? 'Open concierge' : 'About concierge'}</Link>
          </Button>
        </div>
      </MeshPanel>
    </DashboardFrame>
  );
}
