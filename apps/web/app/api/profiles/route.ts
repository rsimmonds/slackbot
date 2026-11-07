import { asViewer } from '@/lib/db';
import { handle, signedIn } from '@/lib/profile/http';
import { candidateOverview, ensureProfile, requireCandidate } from '@/lib/profile/profile';

/** GET /api/profiles — the signed-in candidate's own profile state. Nobody else's, ever. */
export async function GET() {
  return handle(async () => candidateOverview(await signedIn()));
}

/** POST /api/profiles — create the candidate's profile (hidden) if it doesn't exist yet. */
export async function POST() {
  return handle(async () => {
    const viewer = requireCandidate(await signedIn());
    const p = await asViewer(viewer, (tx) => ensureProfile(tx, viewer));
    return { id: p.id, visibility: p.visibility };
  }, 201);
}
