import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, readJson, uuidPattern } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { mandateInput, PostingError, saveMandate } from '@/lib/jobs/posting';

export const dynamic = 'force-dynamic';

const body = z.object({ mandate: mandateInput, confirm: z.boolean().default(false) });

/** PATCH /api/listings/:id — employer: edit the mandate; `confirm: true` signs it off. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) throw new PostingError('Listing not found.', 404);
    const input = await readJson(req, body);
    return NextResponse.json(
      await saveMandate(await getViewer(), id, input.mandate, input.confirm),
    );
  } catch (e) {
    return apiError(e);
  }
}
