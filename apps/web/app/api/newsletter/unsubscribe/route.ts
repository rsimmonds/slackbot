import { json, readBody } from '@/lib/newsletter/http';
import { unsubscribe } from '@/lib/newsletter/service';

/**
 * One-click unsubscribe (RFC 8058). Mail clients POST `List-Unsubscribe=One-Click` to the URL in
 * the List-Unsubscribe header, with the token in the query string. JSON { token } also works.
 * Always 200 for a well-formed request, so the endpoint never reveals which tokens exist.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = await readBody(req);
  const token = url.searchParams.get('token') ?? body.token;
  if (typeof token !== 'string' || !token) return json({ ok: false, error: 'missing_token' }, 400);
  await unsubscribe(token);
  return json({ ok: true, message: 'You are unsubscribed. No further newsletters will be sent.' });
}
