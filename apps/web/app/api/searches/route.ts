import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, readJson } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import {
  listConsoleSearches,
  listEmployerSearches,
  requestSearch,
  SearchError,
} from '@/lib/searches/service';

export const dynamic = 'force-dynamic';

const shape = (s: Awaited<ReturnType<typeof listEmployerSearches>>[number]) => ({
  id: s.id,
  mandateId: s.mandateId,
  title: s.title,
  plan: s.plan,
  status: s.status,
  assigned: !!s.talentPartnerId,
  feeTerms: s.feeTerms,
  placement:
    s.placementComp != null
      ? { comp: s.placementComp, currency: s.placementCurrency, hiredAt: s.hiredAt }
      : null,
  invoiceStatus: s.invoiceStatus,
  createdAt: s.createdAt,
});

/**
 * GET /api/searches — an employer's own searches, or every search for talent partners.
 * POST /api/searches — employer requests a search on a confirmed mandate ({ mandateId, plan, acceptTerms: true }).
 */
export async function GET() {
  try {
    const viewer = await getViewer();
    if (!viewer) throw new SearchError('Sign in.', 401);
    const isTalent = viewer.roles.includes('talent_partner') || viewer.roles.includes('admin');
    const rows = isTalent ? await listConsoleSearches(viewer) : await listEmployerSearches(viewer);
    return NextResponse.json({ data: rows.map(shape) });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req, z.unknown());
    const created = await requestSearch(await getViewer(), body);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
