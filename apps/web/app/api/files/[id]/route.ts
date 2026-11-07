import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { storage } from '@/lib/storage';
import { verifyFileToken } from '@/lib/storage/signed-url';
import { uuidPattern } from '@/lib/api';

const notFound = () =>
  new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });

/**
 * GET /api/files/<id>?token=… — owner-only download. Requires a valid, unexpired signed token
 * for this file AND this signed-in owner, and the read runs under RLS. Anything else is a 404,
 * so the endpoint never confirms that a file exists.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const viewer = await getViewer();
  if (!viewer || !uuidPattern.test(id)) return notFound();
  if (!verifyFileToken(new URL(req.url).searchParams.get('token'), id, viewer.id))
    return notFound();
  const file = await asViewer(viewer, (tx) => storage().get(tx, id));
  if (!file) return notFound();
  const safeName = file.filename.replace(/[^\w .()-]/g, '_');
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'content-type': file.mimeType,
      'content-length': String(file.bytes.length),
      'content-disposition': `attachment; filename="${safeName}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
