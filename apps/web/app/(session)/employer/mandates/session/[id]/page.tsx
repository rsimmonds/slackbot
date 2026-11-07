import { SessionError } from '@cmobeat/ai/interview';
import { notFound, redirect } from 'next/navigation';
import { SessionRunner } from '@/components/session/SessionRunner';
import { requireArea } from '@/lib/auth';
import { uuidPattern } from '@/lib/api';
import { getSession } from '@/lib/sessions/service';

export const metadata = { title: 'Mandate session', robots: { index: false } };

export default async function MandateSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireArea('employer');
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  let session;
  try {
    session = await getSession(viewer, id);
  } catch (e) {
    if (e instanceof SessionError && e.status === 404) notFound();
    throw e;
  }
  if (session.kind !== 'mandate') notFound();
  if (session.status === 'complete' && session.mandateId)
    redirect(`/employer/mandates/${session.mandateId}`);
  return (
    <SessionRunner
      session={session}
      exitHref="/employer/mandates"
      doneTitle="That is everything I need."
      doneBody="I will draft your mandate, 90-day scorecard and interview plan. You can edit every line before you confirm it."
      completeLabel="Draft my mandate"
    />
  );
}
