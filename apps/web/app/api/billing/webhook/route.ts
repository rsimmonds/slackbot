import { paymentsProvider, WebhookSignatureError } from '@cmobeat/payments';
import { NextResponse } from 'next/server';
import { applyPaymentEvent } from '@/lib/jobs/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Payment webhook (Stripe, or the local fake checkout). Verifies the signature over the raw body,
 * then applies the event idempotently. Returns 200 for duplicates so the provider stops retrying.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 256_000)
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  let event;
  try {
    event = await paymentsProvider().parseWebhook(raw, req.headers);
  } catch (e) {
    if (e instanceof WebhookSignatureError)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    return NextResponse.json({ error: 'Malformed event' }, { status: 400 });
  }
  const outcome = await applyPaymentEvent(event);
  return NextResponse.json({ received: true, outcome });
}
