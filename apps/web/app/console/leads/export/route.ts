import { getViewer } from '@/lib/auth';
import { exportLeadsCsv, LeadsError } from '@/lib/report/console';

export const dynamic = 'force-dynamic';

/** GET /console/leads/export — all report leads as CSV, editors and admins only, audit-logged. */
export async function GET() {
  try {
    const csv = await exportLeadsCsv(await getViewer());
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="report-leads.csv"',
        'cache-control': 'private, no-store',
      },
    });
  } catch (e) {
    if (e instanceof LeadsError) return new Response(e.message, { status: e.status });
    throw e;
  }
}
