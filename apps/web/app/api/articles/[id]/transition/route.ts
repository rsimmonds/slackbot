import { getViewer } from '@/lib/auth';
import { EditorialError } from '@/lib/editorial/access';
import { transitionArticle } from '@/lib/editorial/articles';
import { jsonHandler, readJson, uuidParam } from '@/lib/editorial/http';

/**
 * POST /api/articles/:id/transition — editors move an article through review.
 * { action: "submit" } | { action: "publish", confirmOwn?: true } | { action: "reject", note }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return jsonHandler(async () => {
    const id = uuidParam((await params).id);
    const viewer = await getViewer();
    if (!viewer) throw new EditorialError('forbidden', 'Sign in.');
    return transitionArticle(viewer, id, await readJson(req));
  });
}
