import { getViewer } from '@/lib/auth';
import { EditorialError, isEditorial } from '@/lib/editorial/access';
import { getArticle, updateArticle } from '@/lib/editorial/articles';
import { jsonHandler, readJson, uuidParam } from '@/lib/editorial/http';
import { asViewer } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/articles/:idOrSlug — a published article, by id or slug.
 * Editors also see drafts; everyone else gets 404 for anything unpublished.
 */
export async function GET(_req: Request, { params }: Ctx) {
  return jsonHandler(async () => {
    const { id } = await params;
    if (!/^[a-z0-9-]{1,80}$/i.test(id)) throw new EditorialError('not_found', 'Not found.');
    const viewer = await getViewer();
    const a = await asViewer(viewer, (tx) => getArticle(tx, id));
    if (!a || (a.status !== 'published' && !isEditorial(viewer)))
      throw new EditorialError('not_found', 'Not found.');
    return {
      id: a.id,
      slug: a.slug,
      type: a.type,
      title: a.title,
      dek: a.dek,
      bodyMdx: a.bodyMdx,
      takeaways: a.takeaways,
      media: a.media,
      chapters: a.chapters,
      status: a.status,
      publishedAt: a.publishedAt,
    };
  });
}

/** PATCH /api/articles/:id — editors update a draft. */
export async function PATCH(req: Request, { params }: Ctx) {
  return jsonHandler(async () => {
    const id = uuidParam((await params).id);
    const viewer = await getViewer();
    if (!viewer) throw new EditorialError('forbidden', 'Sign in.');
    return updateArticle(viewer, id, await readJson(req));
  });
}
