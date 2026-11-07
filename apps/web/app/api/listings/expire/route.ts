import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { runListingExpiry } from '@/lib/jobs/expiry';

export const dynamic = 'force-dynamic';

const bearerMatches = (header: string | null, secret: string | undefined) => {
  if (!header || !secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * POST /api/listings/expire — run listing expiry and renewal reminders now.
 * Allowed for admins, or for a scheduler presenting CRON_SECRET. Inngest runs it daily anyway.
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  const allowed =
    viewer?.roles.includes('admin') ||
    bearerMatches(req.headers.get('authorization'), process.env.CRON_SECRET);
  if (!allowed) return NextResponse.json({ error: 'Admins only.' }, { status: 403 });
  const result = await runListingExpiry();
  return NextResponse.json({ expired: result.expired.length, reminders: result.reminders });
}
