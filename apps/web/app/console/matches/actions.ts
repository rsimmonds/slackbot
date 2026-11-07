'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { reviewMatch, runMatching } from '@/lib/matches/review';
import { MatchError } from '@/lib/matches/shared';

export interface ActionState {
  error?: string;
  message?: string;
}

const failure = (e: unknown): ActionState => {
  if (e instanceof MatchError) return { error: e.message };
  if (e instanceof Error && e.name === 'ZodError')
    return { error: 'Check the summary and each reason, then try again.' };
  throw e;
};

/** Ask the Matcher for proposals for one confirmed mandate. */
export async function runMatchingAction(mandateId: string): Promise<ActionState> {
  try {
    const r = await runMatching(await getViewer(), mandateId);
    revalidatePath('/console/matches');
    return {
      message: r.proposed.length
        ? `I matched ${r.proposed.length} leaders. A human will review them before anyone is contacted.`
        : 'No new matches. Everyone eligible has already been proposed.',
    };
  } catch (e) {
    return failure(e);
  }
}

/** Parse "+ reason" / "- reason" lines into reasons for and against. */
function parseReasons(raw: string) {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({
      direction: l.startsWith('-') || l.startsWith('–') ? ('against' as const) : ('for' as const),
      reason: l.replace(/^[+\-–]\s*/, ''),
    }));
}

export async function reviewAction(
  matchId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const decision = form.get('decision');
  try {
    if (decision === 'reject') {
      await reviewMatch(await getViewer(), matchId, {
        action: 'reject',
        note: String(form.get('note') ?? ''),
      });
    } else {
      const summary = String(form.get('summary') ?? '');
      const reasons = parseReasons(String(form.get('reasons') ?? ''));
      await reviewMatch(await getViewer(), matchId, {
        action: 'approve',
        rationale: { summary, reasons },
      });
    }
  } catch (e) {
    return failure(e);
  }
  revalidatePath('/console/matches');
  redirect(`/console/matches?reviewed=${decision === 'reject' ? 'rejected' : 'approved'}`);
}
