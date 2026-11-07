import { v1 } from '@/lib/api-keys/http';
import { compAggregates } from '@/lib/intelligence/data';
import { compFiltersSchema, queryObject } from '@/lib/intelligence/filters';

/**
 * GET /api/v1/comp — comp aggregates (p25, median, p75 of range midpoints) by level × market ×
 * currency × basis. Cells backed by fewer than 5 listings are suppressed. Scope: comp:read.
 */
export async function GET(req: Request) {
  return v1(req, 'comp:read', async (url) => {
    const cells = await compAggregates(compFiltersSchema.parse(queryObject(url)));
    return { data: cells, rows: cells.length };
  });
}

export const dynamic = 'force-dynamic';
