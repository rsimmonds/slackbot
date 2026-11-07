import { employerMembers } from '@cmobeat/db';
import { MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { invoiceText, invoiceTone, isoDate } from '@/components/searches/SearchParts';
import { requireArea } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { companyInvoices, parseProduct } from '@/lib/searches/invoices';
import { formatMinor } from '@/lib/searches/terms';

export const metadata = { title: 'Billing' };

const kindLabel = (product: string) => {
  const p = parseProduct(product);
  if (p.kind === 'search_fee') return 'AI-assisted search · success fee';
  if (p.kind === 'fractional_fee') return `Fractional match · ${p.month}`;
  if (product === 'job_post_featured') return 'Job post · featured';
  if (product === 'job_post_standard') return 'Job post · standard';
  return product;
};

export default async function EmployerBillingPage() {
  const viewer = await requireArea('employer');
  const [rows, seat] = await Promise.all([
    companyInvoices(viewer),
    asViewer(viewer, async (tx) => {
      const [m] = await tx
        .select({ seat: employerMembers.seatRole })
        .from(employerMembers)
        .where(eq(employerMembers.userId, viewer.id))
        .limit(1);
      return m?.seat ?? 'member';
    }),
  ]);
  const open = rows.filter((r) => r.status === 'open');
  const owed = open.reduce<Record<string, number>>((acc, r) => {
    acc[r.currency] = (acc[r.currency] ?? 0) + r.amount;
    return acc;
  }, {});

  return (
    <DashboardFrame
      eyebrow="Employer · billing"
      title="Billing"
      lede={
        seat === 'member'
          ? 'Invoices and receipts for your company. Your company’s admins manage payment.'
          : 'Invoices and receipts for your company. Invoices are due within 30 days.'
      }
    >
      <MeshPanel className="col-span-12 lg:col-span-4" eyebrow="Open" title="Amount due">
        {open.length === 0 ? (
          <p className="text-small text-text-2">Nothing due.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {Object.entries(owed).map(([cur, minor]) => (
              <li key={cur} className="numeric text-h3 text-text">
                {formatMinor(minor, cur)}
              </li>
            ))}
          </ul>
        )}
      </MeshPanel>
      <MeshPanel
        className="col-span-12 lg:col-span-8"
        eyebrow={`${rows.length} ${rows.length === 1 ? 'record' : 'records'}`}
        title="Invoices and receipts"
      >
        {rows.length === 0 ? (
          <EmptyState>No invoices yet.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((r) => (
              <li
                key={r.ref}
                data-invoice={r.ref}
                className="flex flex-wrap items-center justify-between gap-4 py-3"
              >
                <span className="flex flex-col gap-1">
                  <span className="text-small text-text">{kindLabel(r.product)}</span>
                  <MonoLabel>{isoDate(r.createdAt)}</MonoLabel>
                </span>
                <span className="flex items-center gap-4">
                  <span className="numeric text-small text-text">
                    {formatMinor(r.amount, r.currency)}
                  </span>
                  <Status tone={invoiceTone(r.status)}>{invoiceText(r.status)}</Status>
                  <Link
                    href={`/billing/invoices/${r.ref}`}
                    className="text-small text-text-2 underline underline-offset-4 hover:text-text"
                    aria-label={`View ${kindLabel(r.product)} from ${isoDate(r.createdAt)}`}
                  >
                    View
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </MeshPanel>
    </DashboardFrame>
  );
}
