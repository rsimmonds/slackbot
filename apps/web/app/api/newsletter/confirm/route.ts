import { json, readBody } from '@/lib/newsletter/http';
import { confirm } from '@/lib/newsletter/service';

/**
 * POST { token }. Confirmation is a POST, not a GET, so link scanners that prefetch the email's
 * URL cannot confirm on the owner's behalf.
 */
export async function POST(req: Request) {
  const { token } = await readBody(req);
  return (await confirm(token))
    ? json({ ok: true })
    : json(
        {
          ok: false,
          error: 'invalid_token',
          message: 'This link has expired or was already used.',
        },
        400,
      );
}
