import { getViewer } from '@/lib/auth';
import { EditorialError } from '@/lib/editorial/access';
import { jsonHandler, readJson, uuidParam } from '@/lib/editorial/http';
import { getMove, publicMove, saveMove } from '@/lib/editorial/moves';
import { asViewer } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/moves/:id — an approved move (editors can also read drafts). */
export async function GET(_req: Request, { params }: Ctx) {
  return jsonHandler(async () => {
    const id = uuidParam((await params).id);
    const viewer = await getViewer();
    const move = await asViewer(viewer, (tx) => getMove(tx, id));
    if (!move) throw new EditorialError('not_found', 'Not found.');
    return publicMove(move);
  });
}

/** PATCH /api/moves/:id — editors save edits to a draft. Every change is audited. */
export async function PATCH(req: Request, { params }: Ctx) {
  return jsonHandler(async () => {
    const id = uuidParam((await params).id);
    const body = await readJson(req);
    const changes = await saveMove(await requireViewer(), id, body);
    return { id, changedFields: Object.keys(changes) };
  });
}

async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) throw new EditorialError('forbidden', 'Sign in.');
  return viewer;
}
