import { NextResponse } from 'next/server';
import { apiError, readJson, uuidPattern } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { appOrigin } from '@/lib/origin';
import { checkoutInput, PostingError, startCheckout } from '@/lib/jobs/posting';

export const dynamic = 'force-dynamic';

/**
 * POST /api/listings/:id/submit — employer: choose a plan and get a checkout URL.
 * A rejected listing that was already paid is resubmitted for review instead.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) throw new PostingError('Listing not found.', 404);
    const { plan } = await readJson(req, checkoutInput);
    return NextResponse.json(
      await startCheckout(await getViewer(), id, plan, await appOrigin(req)),
    );
  } catch (e) {
    return apiError(e);
  }
}
