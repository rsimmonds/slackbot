import { NextResponse } from 'next/server';
import { openApiDocument } from '@/lib/intelligence/openapi';

/** GET /api/v1/openapi.json — the API description. Public; describes shapes, holds no data. */
export function GET() {
  return NextResponse.json(openApiDocument(), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}

export const dynamic = 'force-dynamic';
