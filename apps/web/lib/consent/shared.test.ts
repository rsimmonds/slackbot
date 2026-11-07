import { consentCookieString, parseConsent, serializeConsent } from './shared';

describe('consent cookie', () => {
  it('round-trips accept and decline', () => {
    expect(parseConsent(serializeConsent(true))).toEqual({
      decided: true,
      analytics: true,
      gpc: false,
    });
    expect(parseConsent(serializeConsent(false))).toEqual({
      decided: true,
      analytics: false,
      gpc: false,
    });
  });

  it('treats missing or malformed values as undecided, never as consent', () => {
    expect(parseConsent(undefined)).toEqual({ decided: false, analytics: false, gpc: false });
    expect(parseConsent('yes')).toMatchObject({ decided: false, analytics: false });
    expect(parseConsent('v1.a1.')).toMatchObject({ analytics: false });
    expect(parseConsent('v2.a1.1790000000')).toMatchObject({ analytics: false });
  });

  it('Global Privacy Control declines, even over a stored yes', () => {
    expect(parseConsent(serializeConsent(true), true)).toEqual({
      decided: true,
      analytics: false,
      gpc: true,
    });
  });

  it('writes a six-month, first-party, SameSite=Lax cookie', () => {
    const c = consentCookieString(true, true);
    expect(c).toMatch(
      /^cmob_consent=v1\.a1\.\d+; path=\/; max-age=15724800; samesite=lax; secure$/,
    );
    expect(consentCookieString(false, false)).not.toContain('secure');
  });
});
