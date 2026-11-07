import { closeDb } from '@cmobeat/db';
import type { Viewer } from '@/lib/auth';
import { createDraftMove, editInput, viewers } from '@/test/fixtures';

// Route handlers read the viewer from the session; tests choose who is asking.
let current: Viewer | null = null;
vi.mock('@/lib/auth', () => ({ getViewer: async () => current }));

const movesRoute = await import('./moves/route');
const moveRoute = await import('./moves/[id]/route');
const moveTransition = await import('./moves/[id]/transition/route');
const articlesRoute = await import('./articles/route');
const articleRoute = await import('./articles/[id]/route');
const articleTransition = await import('./articles/[id]/transition/route');

afterAll(() => closeDb());
beforeEach(() => {
  current = null;
});

const json = (body: unknown, method = 'POST') =>
  new Request('http://test.local/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const read = async (res: Response) => ({
  status: res.status,
  body: (await res.json()) as { data?: unknown; error?: string },
});

describe('/api/moves', () => {
  it('GET lists approved moves for anonymous visitors, with filters', async () => {
    const { status, body } = await read(
      await movesRoute.GET(new Request('http://t/api/moves?type=appointed&limit=5')),
    );
    expect(status).toBe(200);
    const data = body.data as { moveType: string; status: string }[];
    expect(data.length).toBeGreaterThan(0);
    expect(data.length).toBeLessThanOrEqual(5);
    expect(data.every((m) => m.moveType === 'appointed' && m.status === 'approved')).toBe(true);
  });

  it('GET ignores status=draft from non-editors', async () => {
    current = viewers.reader;
    const { body } = await read(
      await movesRoute.GET(new Request('http://t/api/moves?status=draft&limit=100')),
    );
    expect((body.data as { status: string }[]).every((m) => m.status === 'approved')).toBe(true);
  });

  it('GET rejects bad filters with 422', async () => {
    const res = await movesRoute.GET(new Request('http://t/api/moves?limit=1000'));
    expect(res.status).toBe(422);
  });

  it('GET /:id hides drafts from the public (404) and shows them to editors', async () => {
    const draft = await createDraftMove();
    expect((await moveRoute.GET(new Request('http://t'), ctx(draft.id))).status).toBe(404);
    current = viewers.editor;
    expect((await moveRoute.GET(new Request('http://t'), ctx(draft.id))).status).toBe(200);
  });

  it('PATCH requires JSON and an editor', async () => {
    const draft = await createDraftMove();
    current = viewers.editor;
    const form = new Request('http://t', {
      method: 'PATCH',
      body: 'title=x',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect((await moveRoute.PATCH(form, ctx(draft.id))).status).toBe(422);
    current = viewers.employer;
    expect((await moveRoute.PATCH(json(editInput(draft), 'PATCH'), ctx(draft.id))).status).toBe(
      403,
    );
    current = viewers.editor;
    const { status, body } = await read(
      await moveRoute.PATCH(json(editInput(draft, { title: 'CMO' }), 'PATCH'), ctx(draft.id)),
    );
    expect(status).toBe(200);
    expect(body.data).toEqual({ id: draft.id, changedFields: ['title'] });
  });

  it('POST transition: anonymous 403, talent partner 403, editor approves, then it is public', async () => {
    const draft = await createDraftMove();
    expect((await moveTransition.POST(json({ action: 'approve' }), ctx(draft.id))).status).toBe(
      403,
    );
    current = viewers.talent;
    expect((await moveTransition.POST(json({ action: 'approve' }), ctx(draft.id))).status).toBe(
      403,
    );
    current = viewers.editor;
    expect(
      (
        await moveTransition.POST(
          json({ action: 'approve', edit: editInput(draft, { sources: [] }) }),
          ctx(draft.id),
        )
      ).status,
    ).toBe(422);
    const ok = await read(await moveTransition.POST(json({ action: 'approve' }), ctx(draft.id)));
    expect(ok).toEqual({ status: 200, body: { data: { id: draft.id, status: 'approved' } } });
    current = null;
    expect((await moveRoute.GET(new Request('http://t'), ctx(draft.id))).status).toBe(200);
    expect(
      (await moveTransition.POST(json({ action: 'reject', note: 'nope' }), ctx(draft.id))).status,
    ).toBe(403);
  });

  it('rejects a malformed id with 404', async () => {
    expect((await moveRoute.GET(new Request('http://t'), ctx('not-a-uuid'))).status).toBe(404);
  });
});

describe('/api/articles', () => {
  const body = (patch: Record<string, unknown> = {}) => ({
    type: 'report',
    title: `Comp report ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`,
    bodyMdx: '<Stat value="$412K" label="Median base" />',
    ...patch,
  });

  it('POST create requires an editor', async () => {
    expect((await articlesRoute.POST(json(body()))).status).toBe(403);
    current = viewers.candidate;
    expect((await articlesRoute.POST(json(body()))).status).toBe(403);
  });

  it('create → submit → publish via the API, then readable by slug publicly', async () => {
    current = viewers.editor;
    const created = await read(await articlesRoute.POST(json(body())));
    expect(created.status).toBe(201);
    const { id, slug } = created.body.data as { id: string; slug: string };

    current = null;
    expect((await articleRoute.GET(new Request('http://t'), ctx(slug))).status).toBe(404);

    current = viewers.editor;
    expect((await articleTransition.POST(json({ action: 'submit' }), ctx(id))).status).toBe(200);
    const own = await read(await articleTransition.POST(json({ action: 'publish' }), ctx(id)));
    expect(own.status).toBe(422);
    expect(
      (await articleTransition.POST(json({ action: 'publish', confirmOwn: true }), ctx(id))).status,
    ).toBe(200);

    current = null;
    const pub = await read(await articleRoute.GET(new Request('http://t'), ctx(slug)));
    expect(pub.status).toBe(200);
    expect(pub.body.data).toMatchObject({ slug, status: 'published' });
    const list = await read(
      await articlesRoute.GET(new Request('http://t/api/articles?type=report&limit=100')),
    );
    expect((list.body.data as { slug: string }[]).map((a) => a.slug)).toContain(slug);
  });

  it('PATCH validates input', async () => {
    current = viewers.editor;
    const { id } = (await read(await articlesRoute.POST(json(body())))).body.data as { id: string };
    expect(
      (await articleRoute.PATCH(json({ ...body(), slug: 'Not A Slug' }, 'PATCH'), ctx(id))).status,
    ).toBe(422);
    expect(
      (await articleRoute.PATCH(json(body({ dek: 'Better.' }), 'PATCH'), ctx(id))).status,
    ).toBe(200);
  });

  it('transition rejects unknown actions', async () => {
    current = viewers.editor;
    const { id } = (await read(await articlesRoute.POST(json(body())))).body.data as { id: string };
    expect((await articleTransition.POST(json({ action: 'delete' }), ctx(id))).status).toBe(422);
  });
});
