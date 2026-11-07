import { json, readBody } from '@/lib/newsletter/http';
import { clientIp } from '@/lib/newsletter/rate-limit';
import { requestReport } from '@/lib/report/leads';

/**
 * POST /api/report/request { email, market, company?, role?, newsletter?, website? }
 * Records the lead, emails the report link, and returns a short-lived download link.
 * The newsletter opt-in is separate and unticked by default.
 */
export async function POST(req: Request) {
  const result = await requestReport(await readBody(req), { ip: clientIp(req.headers) });
  if (result.ok)
    return json({
      ok: true,
      downloadUrl: result.downloadPath,
      newsletterPending: result.newsletterPending,
    });
  return json(result, result.error === 'rate_limited' ? 429 : 400);
}
