'use server';

import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/auth';
import { setDigest } from '@/lib/billing/digest';
import { BillingError } from '@/lib/billing/subscriptions';

export async function digestAction(on: boolean): Promise<{ on: boolean; error?: string }> {
  try {
    const result = await setDigest(await getViewer(), on);
    revalidatePath('/me');
    return { on: result };
  } catch (e) {
    if (e instanceof BillingError) return { on: !on, error: e.message };
    throw e;
  }
}
