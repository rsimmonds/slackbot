import { body, handle, signedIn } from '@/lib/profile/http';
import { decisionsSchema, getProfileDraftForReview, savePortfolio } from '@/lib/profile/review';

/** GET /api/profiles/review?session=<id> — the owner's finalized draft, line by line. */
export async function GET(req: Request) {
  return handle(async () =>
    getProfileDraftForReview(await signedIn(), new URL(req.url).searchParams.get('session') ?? ''),
  );
}

/** POST /api/profiles/review — save, once every line has a decision (approve, edit or remove). */
export async function POST(req: Request) {
  return handle(async () => savePortfolio(await signedIn(), await body(req, decisionsSchema)));
}
