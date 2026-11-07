'use server';

import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { completeFakeSubscriptionCheckout } from '@/lib/billing/fake';
import { appOrigin } from '@/lib/origin';

/** TEST subscription checkout: Pay sends signed subscription + invoice events to the webhook. */
export async function completeSubscriptionCheckout(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');
  const token = String(formData.get('t') ?? '');
  const outcome = formData.get('outcome') === 'pay' ? 'pay' : 'cancel';
  const url = await completeFakeSubscriptionCheckout(viewer, token, outcome, await appOrigin());
  redirect(url);
}
