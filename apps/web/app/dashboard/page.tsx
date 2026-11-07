import { homeFor } from '@cmobeat/config';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';

/** Sends each signed-in user to the home for their highest-privilege role. */
export default async function DashboardRedirect() {
  const viewer = await getViewer();
  redirect(viewer ? homeFor(viewer.roles) : '/sign-in');
}

export const dynamic = 'force-dynamic';
