import type { ReactNode } from 'react';
import { getConsent } from '@/lib/consent/server';

/**
 * Renders its children only when the visitor has accepted analytics and isn't sending GPC.
 * Put every analytics loader (PostHog, Phase 4) inside this gate.
 */
export async function AnalyticsGate({ children }: { children: ReactNode }) {
  const consent = await getConsent();
  return consent.analytics ? children : null;
}

/**
 * Placeholder for the analytics loader. No analytics provider is configured yet; when PostHog is
 * added it loads here, inside the gate, with no candidate PII in events (spec 8.5.3).
 */
export function AnalyticsLoader() {
  return <span hidden data-analytics="enabled" />;
}
