import { MeshPanel } from '@cmobeat/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardFrame } from '@/components/Dashboard';
import { MessageThread } from '@/components/matches/MessageThread';
import { uuidPattern } from '@/lib/api';
import { requireArea } from '@/lib/auth';
import { getThread } from '@/lib/matches/messages';
import { MatchError } from '@/lib/matches/shared';
import { candidateMessageAction } from '../../actions';

export const metadata = { title: 'Messages', robots: { index: false } };

export default async function CandidateMessages({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireArea('candidate');
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  let thread;
  try {
    thread = await getThread(viewer, id);
  } catch (e) {
    if (e instanceof MatchError) notFound();
    throw e;
  }
  return (
    <DashboardFrame
      eyebrow={`Messages · ${thread.roleTitle}`}
      title={thread.counterpart}
      lede="Private to you and the hiring team. Messages are encrypted. Withdraw the introduction at any time from your matches."
      aside={
        <Link href="/me/matches" className="label-mono hover:text-text">
          ← Matches
        </Link>
      }
    >
      <MeshPanel className="col-span-12 lg:col-span-8">
        <MessageThread
          counterpart={thread.counterpart}
          messages={thread.messages.map((m) => ({ ...m, at: m.at.toISOString() }))}
          send={candidateMessageAction.bind(null, id)}
        />
      </MeshPanel>
    </DashboardFrame>
  );
}
