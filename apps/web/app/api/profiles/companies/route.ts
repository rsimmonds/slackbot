import { handle, signedIn } from '@/lib/profile/http';
import { searchCompanies } from '@/lib/profile/visibility';

/** GET /api/profiles/companies?q= — company search for the blocklist and current employer. */
export async function GET(req: Request) {
  return handle(async () => searchCompanies(await signedIn(), new URL(req.url).searchParams.get('q') ?? ''));
}
