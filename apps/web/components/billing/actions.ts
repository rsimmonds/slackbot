'use server';

import type { SubscriptionProduct } from '@cmobeat/config';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import {
  BillingError,
  openBillingPortal,
  setCancelAtPeriodEnd,
  startSubscriptionCheckout,
} from '@/lib/billing/subscriptions';
import { appOrigin } from '@/lib/origin';

export interface BillingActionState {
  error?: string;
  message?: string;
}

const products: readonly SubscriptionProduct[] = ['employer_subscription', 'candidate_concierge'];
const productOf = (fd: FormData): SubscriptionProduct => {
  const p = String(fd.get('product') ?? '');
  if (!(products as readonly string[]).includes(p)) throw new BillingError('Unknown plan.', 400);
  return p as SubscriptionProduct;
};

/** One form posts every subscription action; `intent` says which. Redirects to hosted pages. */
export async function subscriptionAction(
  _prev: BillingActionState,
  fd: FormData,
): Promise<BillingActionState> {
  let url: string;
  try {
    const product = productOf(fd);
    const viewer = await getViewer();
    const origin = await appOrigin();
    const intent = String(fd.get('intent') ?? '');
    if (intent === 'subscribe')
      url = (await startSubscriptionCheckout(viewer, product, origin)).url;
    else if (intent === 'manage') url = (await openBillingPortal(viewer, product, origin)).url;
    else if (intent === 'cancel' || intent === 'resume') {
      const r = await setCancelAtPeriodEnd(viewer, product, intent === 'cancel', origin);
      if (!r.applied) url = r.url;
      else {
        revalidatePath(product === 'employer_subscription' ? '/employer/billing' : '/me/concierge');
        return {
          message:
            intent === 'cancel'
              ? 'Your subscription will end at the close of this period.'
              : 'Your subscription will continue.',
        };
      }
    } else throw new BillingError('Unknown action.', 400);
  } catch (e) {
    if (e instanceof BillingError || (e instanceof Error && e.name === 'PostingError'))
      return { error: e.message };
    throw e;
  }
  redirect(url!);
}
