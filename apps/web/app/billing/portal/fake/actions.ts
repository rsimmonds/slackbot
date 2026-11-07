'use server';

import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { applyPortalChange, type PortalChange } from '@/lib/billing/fake';
import { appOrigin } from '@/lib/origin';

/** TEST portal changes, each sent as the signed event Stripe would send. */
export async function portalAction(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');
  const t = String(formData.get('t') ?? '');
  const intent = String(formData.get('intent') ?? '');
  const change: PortalChange | null =
    intent === 'seats'
      ? { kind: 'seats', seats: Number(formData.get('seats')) }
      : intent === 'cancel'
        ? { kind: 'cancel', cancel: true }
        : intent === 'resume'
          ? { kind: 'cancel', cancel: false }
          : intent === 'end'
            ? { kind: 'end' }
            : intent === 'renew'
              ? { kind: 'renew' }
              : intent === 'fail_payment'
                ? { kind: 'fail_payment' }
                : null;
  if (change) await applyPortalChange(viewer, t, change, await appOrigin());
  redirect(`/billing/portal/fake?t=${encodeURIComponent(t)}&updated=1`);
}
