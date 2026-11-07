import { z } from 'zod';
import { body, handle, signedIn } from '@/lib/profile/http';
import { listBlocklist, setCurrentEmployer } from '@/lib/profile/visibility';

/** PUT /api/profiles/current-employer — { companyId | null }. Setting it blocks the company. */
export async function PUT(req: Request) {
  return handle(async () => {
    const viewer = await signedIn();
    const { companyId } = await body(req, z.object({ companyId: z.uuid().nullable() }));
    await setCurrentEmployer(viewer, companyId);
    return listBlocklist(viewer);
  });
}
