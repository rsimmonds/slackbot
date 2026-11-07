import { adminDb, articles, closeDb } from '@cmobeat/db';
import { eq } from 'drizzle-orm';
import { auditFor, viewers } from '@/test/fixtures';
import {
  articleInputSchema,
  createArticle,
  getEditableArticle,
  listPublishedArticles,
  listQueueArticles,
  slugify,
  transitionArticle,
  updateArticle,
} from './articles';
import { checkMdx, findUnknownComponents } from './mdx-check';

afterAll(() => closeDb());

let n = 0;
const input = (patch: Record<string, unknown> = {}) => ({
  type: 'story',
  title: `The first ninety days ${Date.now()} ${n++}`,
  dek: 'What new CMOs do first.',
  bodyMdx: 'Some **bold** text.\n\n<PullQuote cite="A CMO">Listen first.</PullQuote>',
  takeaways: ['Listen first.'],
  ...patch,
});

const publishedSlugs = async () =>
  (await listPublishedArticles(null, { limit: 100, offset: 0 })).map((a) => a.slug);

describe('articles', () => {
  it('creates a draft authored by the editor, invisible to the public', async () => {
    const a = await createArticle(viewers.editor, input());
    const row = await getEditableArticle(viewers.editor, a.id);
    expect(row).toMatchObject({ status: 'draft', authorId: viewers.editor.id, editorId: null });
    expect(await publishedSlugs()).not.toContain(a.slug);
    expect((await auditFor(a.id))[0]).toMatchObject({ action: 'article.created' });
  });

  it('rejects non-editors', async () => {
    await expect(createArticle(viewers.talent, input())).rejects.toThrow(
      'Editorial is for editors.',
    );
    await expect(createArticle(viewers.employer, input())).rejects.toThrow(
      'Editorial is for editors.',
    );
  });

  it('keeps slugs unique', async () => {
    const a = await createArticle(viewers.editor, input({ slug: `unique-${Date.now()}` }));
    await expect(createArticle(viewers.editor, input({ slug: a.slug }))).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('runs draft → review → publish, recording the editor and asking before self-publishing', async () => {
    const a = await createArticle(viewers.editor, input());
    await expect(
      transitionArticle(viewers.editor, a.id, { action: 'publish' }),
    ).rejects.toMatchObject({
      code: 'conflict',
    });
    await transitionArticle(viewers.editor, a.id, { action: 'submit' });
    await expect(transitionArticle(viewers.editor, a.id, { action: 'publish' })).rejects.toThrow(
      'You are publishing your own draft',
    );
    await transitionArticle(viewers.editor, a.id, { action: 'publish', confirmOwn: true });
    const [row] = await adminDb().select().from(articles).where(eq(articles.id, a.id));
    expect(row).toMatchObject({ status: 'published', editorId: viewers.editor.id });
    expect(row!.publishedAt).toBeInstanceOf(Date);
    expect(await publishedSlugs()).toContain(a.slug);
    const audit = await auditFor(a.id);
    expect(audit.find((e) => e.action === 'article.published')?.metadata).toMatchObject({
      selfReviewed: true,
    });
  });

  it('lets a second editor publish without the self-review prompt', async () => {
    const a = await createArticle(viewers.editor, input());
    await transitionArticle(viewers.editor, a.id, { action: 'submit' });
    await transitionArticle(viewers.admin, a.id, { action: 'publish' });
    const [row] = await adminDb().select().from(articles).where(eq(articles.id, a.id));
    expect(row).toMatchObject({
      status: 'published',
      editorId: viewers.admin.id,
      authorId: viewers.editor.id,
    });
  });

  it('refuses to submit MDX that does not compile or uses unknown components', async () => {
    const bad = await createArticle(viewers.editor, input({ bodyMdx: 'Hello <Chart data="x" />' }));
    await expect(transitionArticle(viewers.editor, bad.id, { action: 'submit' })).rejects.toThrow(
      /Unknown component: Chart/,
    );
    const broken = await createArticle(viewers.editor, input({ bodyMdx: '<Note>unclosed' }));
    await expect(
      transitionArticle(viewers.editor, broken.id, { action: 'submit' }),
    ).rejects.toThrow(/does not compile/);
  });

  it('rejects with a note; the next edit returns it to draft', async () => {
    const a = await createArticle(viewers.editor, input());
    await transitionArticle(viewers.editor, a.id, { action: 'submit' });
    await transitionArticle(viewers.admin, a.id, {
      action: 'reject',
      note: 'Needs a second source.',
    });
    let row = await getEditableArticle(viewers.editor, a.id);
    expect(row).toMatchObject({ status: 'rejected', reviewNote: 'Needs a second source.' });
    await updateArticle(
      viewers.editor,
      a.id,
      input({ title: row!.title, slug: row!.slug, dek: 'Revised.' }),
    );
    row = await getEditableArticle(viewers.editor, a.id);
    expect(row?.status).toBe('draft');
    const actions = (await auditFor(a.id)).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['article.rejected', 'article.edited']));
  });

  it('stores interview media and chapters, and drops them for other types', async () => {
    const a = await createArticle(
      viewers.editor,
      input({
        type: 'interview',
        mediaUrl: 'https://media.example/ep1.mp3',
        chapters: [{ title: 'Intro', at: 0 }],
      }),
    );
    const row = await getEditableArticle(viewers.editor, a.id);
    expect(row).toMatchObject({
      media: { url: 'https://media.example/ep1.mp3' },
      chapters: [{ title: 'Intro', at: 0 }],
    });
    await updateArticle(
      viewers.editor,
      a.id,
      input({ type: 'story', title: row!.title, slug: row!.slug }),
    );
    expect(await getEditableArticle(viewers.editor, a.id)).toMatchObject({
      media: null,
      chapters: null,
    });
  });

  it('puts in-review articles at the top of the queue', async () => {
    const a = await createArticle(viewers.editor, input());
    await transitionArticle(viewers.editor, a.id, { action: 'submit' });
    const q = await listQueueArticles(viewers.editor);
    expect(q[0]?.status).toBe('in_review');
  });
});

describe('input and MDX checks', () => {
  it('derives a slug from the title', () => {
    expect(slugify('Forty CMOs on the First 90 Days — & What Changed')).toBe(
      'forty-cmos-on-the-first-90-days-and-what-changed',
    );
    expect(articleInputSchema.parse(input({ title: 'Héllo World' })).slug).toBe('hello-world');
  });

  it('accepts allowed components and rejects others', async () => {
    expect(findUnknownComponents('<Stat value="1" label="x" /> `<Fake/>`')).toEqual([]);
    expect(findUnknownComponents('<Script>x</Script>')).toEqual(['Script']);
    expect(await checkMdx('# Title\n\n<Note>ok</Note>')).toEqual({ ok: true });
  });

  it('requires https media URLs', () => {
    expect(() =>
      articleInputSchema.parse(input({ type: 'interview', mediaUrl: 'javascript:alert(1)' })),
    ).toThrow();
  });
});
