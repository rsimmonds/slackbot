import { latestExport, myDataRequests, requestExport } from '@/lib/data-rights';
import { handle, signedIn } from '@/lib/profile/http';
import { signedFileUrl } from '@/lib/storage/signed-url';

/** GET /api/profiles/export — request history and a short-lived link to the latest export. */
export async function GET() {
  return handle(async () => {
    const viewer = await signedIn();
    const latest = await latestExport(viewer);
    return {
      requests: (await myDataRequests(viewer)).filter((r) => r.kind === 'export'),
      latest: latest ? { ...latest, downloadUrl: signedFileUrl(latest.id, viewer.id) } : null,
    };
  });
}

/** POST /api/profiles/export — ask for a copy of everything we hold. Any signed-in role. */
export async function POST() {
  return handle(async () => requestExport(await signedIn()), 202);
}
