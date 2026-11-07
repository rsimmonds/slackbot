'use server';

import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/auth';
import { actOnCoaching } from '@/lib/billing/concierge';
import { BillingError } from '@/lib/billing/subscriptions';

export interface CoachState {
  error?: string;
  message?: string;
}

/** Take, schedule (datetime-local, treated as UTC) or mark done. Each is audit-logged. */
export async function coachAction(id: string, _p: CoachState, fd: FormData): Promise<CoachState> {
  const intent = String(fd.get('intent') ?? '');
  try {
    const viewer = await getViewer();
    if (intent === 'take') await actOnCoaching(viewer, id, { action: 'take' });
    else if (intent === 'done') await actOnCoaching(viewer, id, { action: 'done' });
    else if (intent === 'schedule') {
      const local = String(fd.get('at') ?? '');
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
        return { error: 'Choose a date and time.' };
      await actOnCoaching(viewer, id, { action: 'schedule', at: `${local}:00Z` });
    } else return { error: 'Unknown action.' };
  } catch (e) {
    if (e instanceof BillingError || (e instanceof Error && e.name === 'PostingError'))
      return { error: e.message };
    throw e;
  }
  revalidatePath('/console/coaching');
  return {
    message:
      intent === 'take'
        ? 'Taken. Propose a time.'
        : intent === 'schedule'
          ? 'Scheduled. The candidate has been emailed.'
          : 'Marked done.',
  };
}
