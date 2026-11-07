import 'server-only';
import { headers } from 'next/headers';

/**
 * Absolute origin for redirects that leave the app (checkout success/cancel URLs).
 * APP_URL wins whenever it is set, so a forged Host header can never redirect a payer elsewhere.
 * Without APP_URL (local dev and tests), the request's own host is used.
 */
export async function appOrigin(req?: Request): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (req) return new URL(req.url).origin;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
