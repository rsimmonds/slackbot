import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, short-lived download URLs. A token binds the file id, the owner and an expiry; the
 * download route also requires the signed-in viewer to BE that owner, so a leaked link is useless
 * to anyone else and expires in minutes.
 */
const DEFAULT_TTL_SECONDS = 5 * 60;

function secret(): string {
  const s = process.env.STORAGE_URL_SECRET ?? process.env.DEV_AUTH_SECRET;
  if (!s || s.length < 32)
    throw new Error('STORAGE_URL_SECRET (or DEV_AUTH_SECRET) must be at least 32 characters');
  return s;
}

const sign = (payload: string) =>
  createHmac('sha256', secret()).update(payload).digest('base64url');

export function signFileToken(
  fileId: string,
  ownerId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  now = Date.now(),
) {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const payload = `${fileId}.${ownerId}.${exp}`;
  return `${exp}.${sign(payload)}`;
}

export function verifyFileToken(
  token: string | null,
  fileId: string,
  ownerId: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [expRaw, sig] = token.split('.');
  const exp = Number(expRaw);
  if (!sig || !Number.isInteger(exp) || exp * 1000 <= now) return false;
  const expected = Buffer.from(sign(`${fileId}.${ownerId}.${exp}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function signedFileUrl(fileId: string, ownerId: string, ttlSeconds?: number): string {
  return `/api/files/${fileId}?token=${encodeURIComponent(signFileToken(fileId, ownerId, ttlSeconds))}`;
}
