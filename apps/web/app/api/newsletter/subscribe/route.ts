import { json, readBody } from '@/lib/newsletter/http';
import { clientIp } from '@/lib/newsletter/rate-limit';
import { signup } from '@/lib/newsletter/service';

/** POST { email, market?, topics?, source?, website? } → always the same reply for valid input. */
export async function POST(req: Request) {
  const result = await signup(await readBody(req), { ip: clientIp(req.headers) });
  if (result.ok) {
    return json({
      ok: true,
      message: 'Check your inbox to confirm. Nothing is sent until you do.',
    });
  }
  return json(result, result.error === 'rate_limited' ? 429 : 400);
}
