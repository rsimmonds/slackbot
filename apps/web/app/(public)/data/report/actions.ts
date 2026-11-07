'use server';

import { headers } from 'next/headers';
import { clientIp } from '@/lib/newsletter/rate-limit';
import { requestReport } from '@/lib/report/leads';

export interface ReportFormState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
  downloadUrl?: string | null;
  newsletterPending?: boolean;
}

export async function requestReportAction(
  _prev: ReportFormState,
  form: FormData,
): Promise<ReportFormState> {
  const result = await requestReport(
    {
      email: form.get('email'),
      company: form.get('company') || undefined,
      role: form.get('role') || undefined,
      market: form.get('market') || undefined,
      newsletter: form.get('newsletter') ?? undefined,
      website: form.get('website') || undefined,
    },
    { ip: clientIp(await headers()) },
  );
  if (!result.ok) return { status: 'error', message: result.message };
  return {
    status: 'ok',
    downloadUrl: result.downloadPath,
    newsletterPending: result.newsletterPending,
  };
}
