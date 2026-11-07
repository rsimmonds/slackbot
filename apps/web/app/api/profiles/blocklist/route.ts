import { z } from 'zod';
import { body, handle, signedIn } from '@/lib/profile/http';
import { blockCompany, listBlocklist, unblockCompany } from '@/lib/profile/visibility';

const companySchema = z.object({ companyId: z.uuid() });

/** GET /api/profiles/blocklist — companies that can never see this profile. */
export async function GET() {
  return handle(async () => listBlocklist(await signedIn()));
}

/** POST /api/profiles/blocklist — { companyId } */
export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await signedIn();
    await blockCompany(viewer, (await body(req, companySchema)).companyId);
    return listBlocklist(viewer);
  }, 201);
}

/** DELETE /api/profiles/blocklist?companyId=<id> — the current employer can't be removed. */
export async function DELETE(req: Request) {
  return handle(async () => {
    const viewer = await signedIn();
    const { companyId } = companySchema.parse({
      companyId: new URL(req.url).searchParams.get('companyId'),
    });
    await unblockCompany(viewer, companyId);
    return listBlocklist(viewer);
  });
}
