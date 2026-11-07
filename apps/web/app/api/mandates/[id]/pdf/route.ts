import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { getMandate } from '@/lib/mandates/document';
import { renderMandatePdf } from '@/lib/mandates/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'mandate';

/** GET /api/mandates/[id]/pdf — the mandate as a PDF, for its company's members and staff (RLS). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const { id } = await ctx.params;
  const m = await getMandate(viewer, id);
  if (!m) return NextResponse.json({ error: 'Mandate not found.' }, { status: 404 });
  const pdf = await renderMandatePdf(m);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${slug(m.doc.title)}-mandate.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
}
