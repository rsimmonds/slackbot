import { myMatches } from '@/lib/matches/candidate';
import { shortlist } from '@/lib/matches/employer';
import { reviewQueue } from '@/lib/matches/review';
import { handle, isTalent, MatchError, viewerOrThrow } from '@/lib/matches/shared';

/**
 * GET /api/matches — what the viewer may see, by role:
 * talent partners: the review queue; candidates: their approved matches (no company name until
 * reveal); employers: the shortlist for `?mandate=<id>` (anonymised until each candidate consents).
 */
export async function GET(req: Request) {
  return handle(async () => {
    const viewer = await viewerOrThrow();
    const mandate = new URL(req.url).searchParams.get('mandate');
    if (isTalent(viewer)) return reviewQueue(viewer);
    if (viewer.roles.includes('employer') && mandate) return shortlist(viewer, mandate);
    if (viewer.roles.includes('candidate')) return myMatches(viewer);
    if (viewer.roles.includes('employer'))
      throw new MatchError('Pass ?mandate=<id> to see a shortlist.', 400);
    throw new MatchError('You do not have access to matches.', 403);
  });
}
