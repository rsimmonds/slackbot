import { brand } from '@cmobeat/config';
import { paymentsProvider } from '@cmobeat/payments';
import { Button, MonoLabel, Status } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AreaShell } from '@/components/AreaShell';
import { invoiceText, invoiceTone, isoDate } from '@/components/searches/SearchParts';
import { getViewer } from '@/lib/auth';
import { employerNav, staffNav } from '@/lib/nav';
import { getInvoice } from '@/lib/searches/invoices';
import { formatMinor } from '@/lib/searches/terms';
import { markPaidTestAction } from './actions';

export const metadata: Metadata = { title: 'Invoice', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * An invoice, for its company's members and for admins only (payments RLS). With the fake
 * provider this is the TEST hosted invoice; with Stripe, employers pay on Stripe's page.
 */
export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { ref } = await params;
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/billing/invoices/${ref}`)}`);
  if (!/^[A-Za-z0-9_]{6,80}$/.test(ref)) notFound();
  const invoice = await getInvoice(viewer, ref);
  if (!invoice) notFound();
  const isAdmin = viewer.roles.includes('admin');
  const isFake = paymentsProvider().name === 'fake';
  const staff = viewer.roles.some((r) => r === 'admin' || r === 'editor' || r === 'talent_partner');

  return (
    <AreaShell
      area={staff ? 'staff' : 'employer'}
      viewer={viewer}
      nav={staff ? staffNav : employerNav}
    >
      <main className="relative mx-auto max-w-[880px] px-4 pt-12 pb-24 md:px-8">
        {isFake ? (
          <p className="label-mono mb-4 text-filament-ink">Test invoice · no money moves</p>
        ) : null}
        {sp.paid ? (
          <div className="mb-6">
            <Status tone="good">Marked paid. The webhook recorded it.</Status>
          </div>
        ) : null}
        <article
          data-theme="lab"
          className="rounded-panel border border-line bg-surface p-8 md:p-12"
          aria-label="Invoice"
        >
          <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-8">
            <div className="flex flex-col gap-2">
              <span className="font-serif text-h3 text-text">{brand.name}</span>
              <MonoLabel className="break-all">Invoice {invoice.ref}</MonoLabel>
            </div>
            <Status tone={invoiceTone(invoice.status)}>{invoiceText(invoice.status)}</Status>
          </header>
          <dl className="grid gap-6 py-8 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Billed to</dt>
              <dd className="text-small text-text">{invoice.companyName}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Issued</dt>
              <dd className="numeric text-small text-text">{isoDate(invoice.createdAt)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Due</dt>
              <dd className="numeric text-small text-text">{isoDate(invoice.dueAt)}</dd>
            </div>
          </dl>
          <table className="w-full text-left text-small">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="label-mono py-3 font-normal">
                  Description
                </th>
                <th scope="col" className="label-mono py-3 text-right font-normal">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="py-4 pr-6 text-text">{l.description}</td>
                  <td className="numeric py-4 text-right text-text">
                    {formatMinor(l.amountMinor, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="label-mono pt-6 font-normal">
                  Total due · {invoice.currency}
                </th>
                <td className="numeric pt-6 text-right text-h4 text-text">
                  {formatMinor(invoice.amount, invoice.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-8 text-micro text-text-3">
            {invoice.status === 'paid'
              ? 'Paid. Thank you.'
              : `Payment terms: 30 days. Please quote ${invoice.ref} with your payment.`}
          </p>
        </article>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {isAdmin && isFake && invoice.status === 'open' ? (
            <form action={markPaidTestAction}>
              <input type="hidden" name="ref" value={invoice.ref} />
              <Button type="submit" variant="human">
                Mark paid (test)
              </Button>
            </form>
          ) : null}
          {invoice.searchId && !staff ? (
            <Button asChild variant="ghost">
              <Link href={`/employer/searches/${invoice.searchId}`}>Back to the search</Link>
            </Button>
          ) : null}
          {!staff ? (
            <Button asChild variant="ghost">
              <Link href="/employer/billing">All invoices</Link>
            </Button>
          ) : null}
        </div>
      </main>
    </AreaShell>
  );
}
