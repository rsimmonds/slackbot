import { SessionError } from '@cmobeat/ai/interview';
import { notFound, redirect } from 'next/navigation';
import { SessionRunner } from '@/components/session/SessionRunner';
import { uuidPattern } from '@/lib/api';
import { requireArea } from '@/lib/auth';
import { getSession } from '@/lib/sessions/service';

export const metadata = { title: 'Profile interview', robots: { index: false } };

/** The candidate's profile interview. Only the owner can load or answer it. */
export default async function ProfileInterview({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireArea('candidate');
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  let session;
  try {
    session = await getSession(viewer, id);
  } catch (e) {
    if (e instanceof SessionError && e.status === 404) notFound();
    throw e;
  }
  if (session.kind !== 'profile') notFound();
  if (session.status === 'complete') redirect(`/me/profile/review?session=${id}`);
  return (
    <SessionRunner
      session={session}
      exitHref="/me"
      doneTitle="That is everything I need."
      doneBody="I will draft your proof-of-outcomes profile. Nothing is saved until you approve every line, and it stays visible to no one."
      completeLabel="Draft my profile"
    />
  );
}
