import { z } from 'zod';
import { readJson } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { setDigest } from '@/lib/billing/digest';
import { handle } from '@/lib/billing/http';

export const dynamic = 'force-dynamic';
const input = z.object({ on: z.boolean() });

/** POST /api/me/digest — turn the weekly career digest on or off. */
export async function POST(req: Request) {
  return handle(async () => {
    const { on } = await readJson(req, input);
    return { on: await setDigest(await getViewer(), on) };
  });
}
