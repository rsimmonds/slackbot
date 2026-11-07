import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebhookSignatureError } from './types';

/**
 * Stripe-style signature for the local fake provider: header `t=<unix>,v1=<hex hmac>` over
 * `${t}.${body}`. Same shape as Stripe, so the webhook route exercises the same checks.
 */
export const FAKE_SIGNATURE_HEADER = 'x-fake-payments-signature';
const TOLERANCE_SECONDS = 300;

export function signPayload(body: string, secret: string, now = Date.now()): string {
  const t = Math.floor(now / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

export function verifySignature(
  body: string,
  header: string | null,
  secret: string,
  now = Date.now(),
): void {
  if (!header) throw new WebhookSignatureError('Missing signature');
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=', 2) as [string, string]),
  );
  const t = Number(parts.t);
  const sig = parts.v1;
  if (!Number.isFinite(t) || !sig) throw new WebhookSignatureError('Malformed signature');
  if (Math.abs(now / 1000 - t) > TOLERANCE_SECONDS)
    throw new WebhookSignatureError('Signature too old');
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest();
  const given = Buffer.from(sig, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new WebhookSignatureError();
  }
}
