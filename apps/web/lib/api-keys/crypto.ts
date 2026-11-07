import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/** Keys look like `cmob_live_` + 32 base62 characters. Only a peppered hash is ever stored. */
export const KEY_PREFIX = 'cmob_live_';
export const KEY_PATTERN = /^cmob_live_[0-9A-Za-z]{32}$/;
/** How much of the key is stored in clear, so people can tell their keys apart. */
export const DISPLAY_PREFIX_LENGTH = 12;

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function generateKey(): string {
  let body = '';
  for (let i = 0; i < 32; i++) body += BASE62[randomInt(BASE62.length)];
  return `${KEY_PREFIX}${body}`;
}

/**
 * The pepper lives in the environment, never in the database, so a database leak alone can't
 * be used to brute-force keys. Dev and tests fall back to a value derived from DEV_AUTH_SECRET.
 */
function pepper(): string {
  const p = process.env.API_KEY_PEPPER || process.env.DEV_AUTH_SECRET;
  if (!p || p.length < 16) throw new Error('API_KEY_PEPPER must be set (16+ characters).');
  if (!process.env.API_KEY_PEPPER && process.env.VERCEL_ENV === 'production')
    throw new Error('API_KEY_PEPPER must be set in production.');
  return p;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(`${key}${pepper()}`).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export const displayPrefix = (key: string) => key.slice(0, DISPLAY_PREFIX_LENGTH);
