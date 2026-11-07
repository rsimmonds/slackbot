import { getViewer } from '@/lib/auth';
import { EditorialError } from '@/lib/editorial/access';
import {
  articleFiltersSchema,
  createArticle,
  listPublishedArticles,
} from '@/lib/editorial/articles';
import { jsonHandler, readJson, searchParamsObject } from '@/lib/editorial/http';

/** GET /api/articles — published articles, newest first. Filters: type, limit, offset. */
export async function GET(req: Request) {
  return jsonHandler(async () => {
    const filters = articleFiltersSchema.parse(searchParamsObject(req));
    return listPublishedArticles(await getViewer(), filters);
  });
}

/** POST /api/articles — editors create a draft. The author is the signed-in editor. */
export async function POST(req: Request) {
  return jsonHandler(
    async () => {
      const viewer = await getViewer();
      if (!viewer) throw new EditorialError('forbidden', 'Sign in.');
      return createArticle(viewer, await readJson(req));
    },
    { status: 201 },
  );
}
