import { v1 } from '@/lib/api-keys/http';
import { listCompanies } from '@/lib/intelligence/data';
import { companyFiltersSchema, queryObject } from '@/lib/intelligence/filters';

/** GET /api/v1/companies — companies' public fields, alphabetical. Scope: moves:read. */
export async function GET(req: Request) {
  return v1(req, 'moves:read', async (url) => {
    const page = await listCompanies(companyFiltersSchema.parse(queryObject(url)));
    return { data: page.data, nextCursor: page.nextCursor, rows: page.data.length };
  });
}

export const dynamic = 'force-dynamic';
