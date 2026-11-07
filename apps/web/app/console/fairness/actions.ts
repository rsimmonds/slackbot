'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { canEnter } from '@/lib/areas';
import { getViewer } from '@/lib/auth';
import { runFairnessReport } from '@/lib/matching/fairness';

/** Staff can run the report on demand; it also runs weekly. */
export async function runFairnessReportAction() {
  const viewer = await getViewer();
  if (!viewer || !canEnter('staff', viewer.roles)) redirect('/sign-in?next=/console/fairness');
  await runFairnessReport({ actorId: viewer.id });
  revalidatePath('/console/fairness');
  redirect('/console/fairness?ran=1');
}
