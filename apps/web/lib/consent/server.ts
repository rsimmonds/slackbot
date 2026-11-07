import 'server-only';
import { cookies, headers } from 'next/headers';
import { CONSENT_COOKIE, parseConsent, type Consent } from './shared';

/** The visitor's consent for this request. GPC wins over a stored "yes". */
export async function getConsent(): Promise<Consent> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  return parseConsent(jar.get(CONSENT_COOKIE)?.value, h.get('sec-gpc') === '1');
}
