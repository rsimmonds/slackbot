import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { companyInvoices, parseProduct } from '@/lib/searches/invoices';
import { SearchError } from '@/lib/searches/service';

export const dynamic = 'force-dynamic';

/** GET /api/billing/invoices — everything billed to the signed-in employer's company. */
export async function GET() {
  try {
    const viewer = await getViewer();
    if (!viewer) throw new SearchError('Sign in.', 401);
    if (!viewer.roles.includes('employer')) throw new SearchError('Billing is for employers.', 403);
    const rows = await companyInvoices(viewer);
    return NextResponse.json({
      data: rows.map((r) => ({
        ref: r.ref,
        kind: parseProduct(r.product).kind === 'other' ? r.product : parseProduct(r.product).kind,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        createdAt: r.createdAt,
        url: `/billing/invoices/${r.ref}`,
      })),
    });
  } catch (e) {
    return apiError(e);
  }
}
