import { notFound } from 'next/navigation';
import { SessionRunner } from '@/components/session/SessionRunner';
import { uuidPattern } from '@/lib/api';
import { requireArea } from '@/lib/auth';

export const metadata = { title: 'Profile interview', robots: { index: false } };

/** The candidate's profile interview. The session API enforces that only the owner can run it. */
export default async function ProfileInterview({ params }: { params: Promise<{ id: string }> }) {
  await requireArea('candidate');
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  return <SessionRunner sessionId={id} completeHref={`/me/profile/review?session=${id}`} />;
}
