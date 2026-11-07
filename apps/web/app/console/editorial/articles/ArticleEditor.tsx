'use client';

import {
  Button,
  Field,
  Input,
  MeshPanel,
  MonoLabel,
  SignalLine,
  Status,
  Textarea,
} from '@cmobeat/ui';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { componentSnippets } from '@/lib/editorial/snippets';
import {
  previewArticleAction,
  saveArticleAction,
  transitionArticleAction,
  type ActionState,
} from '../actions';

type ArticleType = 'story' | 'interview' | 'report';
type ArticleStatus = 'draft' | 'in_review' | 'rejected' | 'published';

export interface EditorArticle {
  id: string | null;
  type: ArticleType;
  title: string;
  slug: string;
  dek: string;
  bodyMdx: string;
  takeaways: string[];
  mediaUrl: string;
  chapters: { title: string; at: number }[];
  status: ArticleStatus;
  reviewNote: string | null;
  ownDraft: boolean;
}

const selectClass =
  'h-10 w-full rounded-control border border-line bg-surface px-3 text-small text-text hover:border-line-strong focus:border-synapse focus:outline-none';

const slugify = (t: string) =>
  t
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export function ArticleEditor({ initial }: { initial: EditorArticle }) {
  const [a, setA] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const [rendered, setRendered] = useState<{ source: string; node?: ReactNode; error?: string }>({
    source: '',
  });
  const [confirmOwn, setConfirmOwn] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const body = useRef<HTMLTextAreaElement>(null);
  const locked = a.status === 'published' || a.status === 'in_review';

  const set = <K extends keyof EditorArticle>(k: K, v: EditorArticle[K]) =>
    setA((x) => ({ ...x, [k]: v }));
  const err = (k: string) => state?.fieldErrors?.[k];

  // Live preview, debounced. The server renders it with the same renderer readers get.
  useEffect(() => {
    const source = a.bodyMdx;
    if (!source.trim()) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await previewArticleAction(source);
      if (!cancelled) setRendered(r.ok ? { source, node: r.node } : { source, error: r.error });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [a.bodyMdx]);
  const hasBody = !!a.bodyMdx.trim();
  const preview = {
    loading: hasBody && rendered.source !== a.bodyMdx,
    node: hasBody ? rendered.node : undefined,
    error: hasBody ? rendered.error : undefined,
  };

  const payload = () => ({
    type: a.type,
    title: a.title,
    slug: a.slug,
    dek: a.dek,
    bodyMdx: a.bodyMdx,
    takeaways: a.takeaways.map((t) => t.trim()).filter(Boolean),
    mediaUrl: a.type === 'interview' ? a.mediaUrl : '',
    chapters: a.type === 'interview' ? a.chapters.filter((c) => c.title.trim()) : [],
  });

  const insertSnippet = (snippet: string) => {
    const el = body.current;
    const at = el?.selectionStart ?? a.bodyMdx.length;
    const next = `${a.bodyMdx.slice(0, at)}\n\n${snippet}\n\n${a.bodyMdx.slice(at)}`;
    set('bodyMdx', next);
    requestAnimationFrame(() => el?.focus());
  };

  const run = (fn: () => Promise<ActionState>) => start(async () => setState(await fn()));

  return (
    <div className="grid grid-cols-12 gap-6">
      <MeshPanel
        className="col-span-12 xl:col-span-7"
        eyebrow={a.id ? 'Edit article' : 'New article'}
      >
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await saveArticleAction(a.id, payload());
              if (r?.ok && r.id) set('status', a.status === 'rejected' ? 'draft' : a.status);
              return r;
            });
          }}
        >
          <fieldset disabled={locked} className="flex flex-col gap-6 disabled:opacity-70">
            <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
              <Field label="Type">
                {(id) => (
                  <select
                    id={id}
                    className={selectClass}
                    value={a.type}
                    onChange={(e) => set('type', e.target.value as ArticleType)}
                  >
                    <option value="story">Story</option>
                    <option value="interview">Interview (The Mandate)</option>
                    <option value="report">Report</option>
                  </select>
                )}
              </Field>
              <Field label="Headline" hint={err('title')}>
                {(id) => (
                  <Input
                    id={id}
                    value={a.title}
                    onChange={(e) => {
                      set('title', e.target.value);
                      if (!slugTouched) set('slug', slugify(e.target.value));
                    }}
                    required
                  />
                )}
              </Field>
            </div>
            <Field label="Slug" hint={err('slug') ?? `cmobeat.com/articles/${a.slug || '…'}`}>
              {(id) => (
                <Input
                  id={id}
                  value={a.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set('slug', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Dek" hint={err('dek') ?? 'One sentence under the headline.'}>
              {(id) => <Input id={id} value={a.dek} onChange={(e) => set('dek', e.target.value)} />}
            </Field>
            <Field
              label="Body · MDX"
              hint={
                err('bodyMdx') ?? 'Markdown, plus the components below. JavaScript is not allowed.'
              }
            >
              {(id) => (
                <Textarea
                  id={id}
                  ref={body}
                  rows={18}
                  className="font-mono text-small"
                  value={a.bodyMdx}
                  onChange={(e) => set('bodyMdx', e.target.value)}
                />
              )}
            </Field>
            <div className="flex flex-col gap-2">
              <MonoLabel>Insert</MonoLabel>
              <div className="flex flex-wrap gap-2">
                {componentSnippets.map((c) => (
                  <Button
                    key={c.name}
                    type="button"
                    variant="secondary"
                    size="sm"
                    title={c.description}
                    onClick={() => insertSnippet(c.snippet)}
                  >
                    {c.name}
                  </Button>
                ))}
              </div>
            </div>

            <fieldset className="flex flex-col gap-3">
              <legend className="label-mono mb-2">Key takeaways</legend>
              {a.takeaways.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    aria-label={`Takeaway ${i + 1}`}
                    value={t}
                    onChange={(e) =>
                      set(
                        'takeaways',
                        a.takeaways.map((x, j) => (j === i ? e.target.value : x)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      set(
                        'takeaways',
                        a.takeaways.filter((_, j) => j !== i),
                      )
                    }
                    aria-label={`Remove takeaway ${i + 1}`}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={a.takeaways.length >= 8}
                  onClick={() => set('takeaways', [...a.takeaways, ''])}
                >
                  Add takeaway
                </Button>
              </div>
            </fieldset>

            {a.type === 'interview' ? (
              <fieldset className="flex flex-col gap-4">
                <legend className="label-mono mb-2">Interview media</legend>
                <Field label="Audio or video URL (https)" hint={err('mediaUrl')}>
                  {(id) => (
                    <Input
                      id={id}
                      type="url"
                      value={a.mediaUrl}
                      onChange={(e) => set('mediaUrl', e.target.value)}
                    />
                  )}
                </Field>
                {a.chapters.map((c, i) => (
                  <div key={i} className="grid gap-2 md:grid-cols-[3fr_1fr_auto] md:items-end">
                    <Field label={`Chapter ${i + 1}`}>
                      {(id) => (
                        <Input
                          id={id}
                          value={c.title}
                          onChange={(e) =>
                            set(
                              'chapters',
                              a.chapters.map((x, j) =>
                                j === i ? { ...x, title: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      )}
                    </Field>
                    <Field label="Starts at (seconds)">
                      {(id) => (
                        <Input
                          id={id}
                          type="number"
                          min={0}
                          value={c.at}
                          onChange={(e) =>
                            set(
                              'chapters',
                              a.chapters.map((x, j) =>
                                j === i ? { ...x, at: Number(e.target.value) } : x,
                              ),
                            )
                          }
                        />
                      )}
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        set(
                          'chapters',
                          a.chapters.filter((_, j) => j !== i),
                        )
                      }
                      aria-label={`Remove chapter ${i + 1}`}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => set('chapters', [...a.chapters, { title: '', at: 0 }])}
                  >
                    Add chapter
                  </Button>
                </div>
              </fieldset>
            ) : null}
          </fieldset>

          {state?.message ? (
            <p role="status" aria-live="polite">
              <Status tone={state.ok ? 'good' : 'critical'}>{state.message}</Status>
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3 border-t border-line pt-6">
            {!locked ? (
              <Button type="submit" variant="secondary" disabled={pending}>
                Save draft
              </Button>
            ) : null}
            {a.id && (a.status === 'draft' || a.status === 'rejected') ? (
              <Button
                type="button"
                variant="primary"
                disabled={pending || !!preview.error}
                onClick={() =>
                  run(async () => {
                    const saved = await saveArticleAction(a.id, payload());
                    if (!saved?.ok) return saved;
                    const r = await transitionArticleAction(a.id!, { action: 'submit' });
                    if (r?.ok) set('status', 'in_review');
                    return r;
                  })
                }
              >
                Submit for review
              </Button>
            ) : null}
            {a.id && a.status === 'in_review' ? (
              <>
                <Button
                  type="button"
                  variant="human"
                  disabled={pending || (a.ownDraft && !confirmOwn)}
                  onClick={() =>
                    run(() =>
                      transitionArticleAction(a.id!, {
                        action: 'publish',
                        confirmOwn: a.ownDraft ? confirmOwn : undefined,
                      }),
                    )
                  }
                >
                  Publish
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={pending}
                  onClick={() => setRejecting((v) => !v)}
                  aria-expanded={rejecting}
                >
                  Return with note
                </Button>
              </>
            ) : null}
          </div>

          {a.id && a.status === 'in_review' && a.ownDraft ? (
            <label className="flex items-start gap-3 rounded-control border border-filament/50 bg-filament-glow p-4 text-small text-text">
              <input
                type="checkbox"
                className="mt-1 accent-[var(--filament-ink)]"
                checked={confirmOwn}
                onChange={(e) => setConfirmOwn(e.target.checked)}
              />
              <span>
                You are publishing your own draft. I&apos;ll record you as both author and editor.
                Ask another editor if you can.
              </span>
            </label>
          ) : null}

          {rejecting ? (
            <div className="flex flex-col gap-3 rounded-control border border-critical/40 p-4">
              <Field label="What needs to change?">
                {(id) => (
                  <Textarea
                    id={id}
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                )}
              </Field>
              <div>
                <Button
                  type="button"
                  variant="danger"
                  disabled={pending || note.trim().length < 3}
                  onClick={() =>
                    run(() => transitionArticleAction(a.id!, { action: 'reject', note }))
                  }
                >
                  Return to author
                </Button>
              </div>
            </div>
          ) : null}
        </form>
      </MeshPanel>

      <section aria-label="Preview" className="col-span-12 xl:col-span-5">
        <div className="sticky top-24 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <MonoLabel>Preview · as readers will see it</MonoLabel>
            {preview.loading ? <Status tone="machine">Rendering</Status> : null}
          </div>
          {preview.loading ? <SignalLine label="Rendering preview" /> : null}
          <article
            data-theme="lab"
            className="max-h-[75vh] overflow-y-auto rounded-panel border border-line p-8"
          >
            <h2 className="font-serif text-h2 leading-tight text-text">{a.title || 'Untitled'}</h2>
            {a.dek ? <p className="mt-3 text-h4 text-text-2">{a.dek}</p> : null}
            {preview.error ? (
              <p role="alert" className="mt-6 text-small text-critical-ink">
                This won&apos;t publish yet: {preview.error}
              </p>
            ) : (
              <div className="mt-6">
                {preview.node ?? (
                  <p className="text-small text-text-3">Start writing to see the preview.</p>
                )}
              </div>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
