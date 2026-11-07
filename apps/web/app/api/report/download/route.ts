import { NextResponse } from 'next/server';
import { REPORT_SLUG, reportData } from '@/lib/report/data';
import { isReportLead } from '@/lib/report/leads';
import { verifyReportToken } from '@/lib/report/link';
import { renderReportPdf } from '@/lib/report/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/report/download?d=<lead id>&t=<signed token> — the report PDF, for a valid link only. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('d') ?? '';
  const token = url.searchParams.get('t');
  if (!verifyReportToken(token, id) || !(await isReportLead(id))) {
    return NextResponse.json(
      { error: 'This link has expired or is not valid. Request the report again.' },
      { status: 403 },
    );
  }
  const pdf = await renderReportPdf(await reportData());
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${REPORT_SLUG}.pdf"`,
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  });
}
