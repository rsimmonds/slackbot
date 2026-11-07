'use server';

import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { appOrigin } from '@/lib/origin';
import { markInvoicePaidTest } from '@/lib/searches/invoices';

/** Admin-only, fake provider only: sends a signed invoice.paid event to the real webhook. */
export async function markPaidTestAction(formData: FormData) {
  const ref = String(formData.get('ref') ?? '');
  if (!/^fake_in_[0-9a-f]{32}$/.test(ref)) redirect('/console');
  await markInvoicePaidTest(await getViewer(), ref, await appOrigin());
  redirect(`/billing/invoices/${ref}?paid=1`);
}
