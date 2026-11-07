import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, short-lived report download links. The token binds the download (lead) id and an
 * expiry, so a link works without an account but stops working after a while and can't be
 * forged or pointed at another download. The page link lasts 2 hours; the emailed link 48.
 */
export const PAGE_LINK_TTL_SECONDS = 2 * 60 * 60;
export const EMAIL_LINK_TTL_SECONDS = 48 * 60 * 60;

function secret(): string {
  const s = process.env.STORAGE_URL_SECRET ?? process.env.DEV_AUTH_SECRET;
  if (!s || s.length < 32)
    throw new Error('STORAGE_URL_SECRET (or DEV_AUTH_SECRET) must be at least 32 characters');
  return s;
}

const sign = (payload: string) =>
  createHmac('sha256', secret()).update(`report:${payload}`).digest('base64url');

export function signReportToken(downloadId: string, ttlSeconds: number, now = Date.now()) {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return `${exp}.${sign(`${downloadId}.${exp}`)}`;
}

export function verifyReportToken(
  token: string | null,
  downloadId: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [expRaw, sig] = token.split('.');
  const exp = Number(expRaw);
  if (!sig || !Number.isInteger(exp) || exp * 1000 <= now) return false;
  const expected = Buffer.from(sign(`${downloadId}.${exp}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function reportDownloadPath(downloadId: string, ttlSeconds: number, now = Date.now()) {
  const t = encodeURIComponent(signReportToken(downloadId, ttlSeconds, now));
  return `/api/report/download?d=${downloadId}&t=${t}`;
}
