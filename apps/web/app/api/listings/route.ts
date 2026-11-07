import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { parseFilters } from '@/lib/jobs/filters';
import { compLabel } from '@/lib/jobs/format';
import { createDraftFromParse, parseInput } from '@/lib/jobs/posting';
import { searchJobs } from '@/lib/jobs/queries';

export const dynamic = 'force-dynamic';

/** GET /api/listings — public search. Same filters as /jobs. Live listings only. */
export async function GET(req: Request) {
  const filters = parseFilters(new URL(req.url).searchParams);
  const viewer = await getViewer();
  const { items, total, page, pages } = await asViewer(viewer, (tx) => searchJobs(tx, filters));
  return NextResponse.json({
    total,
    page,
    pages,
    items: items.map((j) => ({
      id: j.listingId,
      title: j.title,
      level: j.level,
      workType: j.workType,
      company: { name: j.companyName, industry: j.companyIndustry, stage: j.companyStage },
      comp: {
        min: j.compMin,
        max: j.compMax,
        currency: j.currency,
        basis: j.compBasis,
        label: compLabel(j.compMin, j.compMax, j.currency, j.compBasis),
      },
      location: j.location,
      remote: j.remote,
      market: j.market,
      featured: j.featured,
      publishedAt: j.publishedAt,
      expiresAt: j.expiresAt,
      url: `/jobs/${j.listingId}`,
    })),
  });
}

/** POST /api/listings — employer: parse a job description and create a draft listing. */
export async function POST(req: Request) {
  try {
    const input = await readJson(req, parseInput);
    const draft = await createDraftFromParse(await getViewer(), input);
    return NextResponse.json(draft, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
