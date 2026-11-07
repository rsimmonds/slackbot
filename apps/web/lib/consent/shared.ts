/**
 * Cookie consent, shared by server and client.
 *
 * Only strictly necessary cookies are used today (session, theme, this choice). Analytics is the
 * only optional category and stays off until someone says yes. Global Privacy Control
 * (Sec-GPC: 1 / navigator.globalPrivacyControl) counts as a decline, with no banner.
 */
export const CONSENT_COOKIE = 'cmob_consent';
/** Six months, in seconds. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;
const VERSION = 'v1';

export interface Consent {
  /** True once the visitor chose, or sent GPC. Hides the banner. */
  decided: boolean;
  analytics: boolean;
  /** The visitor's browser sent Global Privacy Control. */
  gpc: boolean;
}

export const undecided: Consent = { decided: false, analytics: false, gpc: false };

/** Cookie value: "v1.a1.<epoch seconds>" or "v1.a0.<epoch seconds>". */
export function serializeConsent(analytics: boolean, now = Date.now()): string {
  return `${VERSION}.a${analytics ? 1 : 0}.${Math.floor(now / 1000)}`;
}

export function parseConsent(value: string | undefined | null, gpc = false): Consent {
  if (gpc) return { decided: true, analytics: false, gpc: true };
  const m = value?.match(/^v1\.a([01])\.\d{9,11}$/);
  if (!m) return undecided;
  return { decided: true, analytics: m[1] === '1', gpc: false };
}

export function consentCookieString(analytics: boolean, secure: boolean): string {
  return [
    `${CONSENT_COOKIE}=${serializeConsent(analytics)}`,
    'path=/',
    `max-age=${CONSENT_MAX_AGE}`,
    'samesite=lax',
    secure ? 'secure' : null,
  ]
    .filter(Boolean)
    .join('; ');
}
