import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { KeyError } from '@/lib/api-keys/keys';
import { getViewer } from '@/lib/auth';
import { InvalidCursorError } from '@/lib/intelligence/filters';
import { exportDataset } from '@/lib/intelligence/export';

/**
 * GET /employer/data/export?dataset=moves|comp&format=csv|json[&filters…]
 * Streams a dataset for subscribing employers. Route handlers skip the area layout, so access is
 * checked here (signed-in employer, active subscription) and every export is audit-logged.
 */
export async function GET(req: Request) {
  try {
    const viewer = await getViewer();
    const params = Object.fromEntries(new URL(req.url).searchParams.entries());
    const { body, filename, contentType } = await exportDataset(viewer, params);
    return new Response(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof KeyError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError || e instanceof InvalidCursorError)
      return NextResponse.json({ error: 'Invalid export options.' }, { status: 400 });
    throw e;
  }
}

export const dynamic = 'force-dynamic';
