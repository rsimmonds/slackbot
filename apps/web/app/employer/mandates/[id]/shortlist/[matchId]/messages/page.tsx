import { MeshPanel } from '@cmobeat/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardFrame } from '@/components/Dashboard';
import { MessageThread } from '@/components/matches/MessageThread';
import { uuidPattern } from '@/lib/api';
import { requireArea } from '@/lib/auth';
import { getThread } from '@/lib/matches/messages';
import { MatchError } from '@/lib/matches/shared';
import { employerMessageAction } from '../../actions';

export const metadata = { title: 'Messages', robots: { index: false } };

export default async function EmployerMessages({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>;
}) {
  const viewer = await requireArea('employer');
  const { id, matchId } = await params;
  if (!uuidPattern.test(id) || !uuidPattern.test(matchId)) notFound();
  let thread;
  try {
    thread = await getThread(viewer, matchId);
  } catch (e) {
    if (e instanceof MatchError) notFound();
    throw e;
  }
  if (thread.mandateId !== id) notFound();
  return (
    <DashboardFrame
      eyebrow={`Messages · ${thread.roleTitle}`}
      title={thread.counterpart}
      lede="Private to the two of you. Messages are encrypted, and email notifications never include what you wrote."
      aside={
        <Link href={`/employer/mandates/${id}/shortlist`} className="label-mono hover:text-text">
          ← Shortlist
        </Link>
      }
    >
      <MeshPanel className="col-span-12 lg:col-span-8">
        <MessageThread
          counterpart={thread.counterpart}
          messages={thread.messages.map((m) => ({ ...m, at: m.at.toISOString() }))}
          send={employerMessageAction.bind(null, id, matchId)}
        />
      </MeshPanel>
    </DashboardFrame>
  );
}
