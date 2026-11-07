import 'server-only';
import { inngest } from '@/inngest/client';

/**
 * Matching triggers (spec 8.2). Callers fire these after their own transaction commits. When
 * Inngest is not configured (local dev, CI) the event is skipped and the nightly run catches up;
 * a matching problem must never fail the action that triggered it.
 */
export const MATCHING_EVENTS = {
  mandateConfirmed: 'matching/mandate.confirmed',
  profileVisible: 'matching/profile.visible',
} as const;

const inngestConfigured = () => !!process.env.INNGEST_EVENT_KEY || process.env.INNGEST_DEV === '1';

async function emit(name: string, data: Record<string, string>) {
  if (!inngestConfigured()) return false;
  try {
    await inngest.send({ name, data });
    return true;
  } catch (error) {
    console.error(`matching trigger ${name} failed`, (error as Error).message);
    return false;
  }
}

export const onMandateConfirmed = (mandateId: string) =>
  emit(MATCHING_EVENTS.mandateConfirmed, { mandateId });

/** Only when a profile becomes matchable (anonymous or open). Hidden never triggers matching. */
export const onProfileVisible = (profileId: string) =>
  emit(MATCHING_EVENTS.profileVisible, { profileId });
