'use client';

import { Button, Field, Input, MeshPanel, Status, Textarea } from '@cmobeat/ui';
import { useState, useTransition } from 'react';
import {
  approveMoveAction,
  rejectMoveAction,
  saveMoveAction,
  type ActionState,
} from '../../actions';

type Kind = 'newsroom' | 'wire' | 'edgar' | 'submission';
interface Source {
  url: string;
  label: string;
  kind: Kind;
}
interface Draft {
  id: string;
  personName: string;
  companyId: string;
  moveType: 'appointed' | 'departed' | 'promoted';
  title: string;
  previousRole: string;
  effectiveDate: string;
  summary: string;
  sources: Source[];
}

const selectClass =
  'h-10 w-full rounded-control border border-line bg-surface px-3 text-small text-text hover:border-line-strong focus:border-synapse focus:outline-none';

export function MoveReviewForm({
  move,
  companies,
}: {
  move: Draft;
  companies: { id: string; name: string }[];
}) {
  const [draft, setDraft] = useState<Draft>(move);
  const [state, setState] = useState<ActionState>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setSource = (i: number, patch: Partial<Source>) =>
    set(
      'sources',
      draft.sources.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    );
  const { id, ...edit } = draft;
  const err = (k: string) => state?.fieldErrors?.[k];
  const run = (fn: () => Promise<ActionState>) => start(async () => setState(await fn()));

  return (
    <MeshPanel eyebrow="Draft" title="Edit before you approve">
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveMoveAction(id, edit));
        }}
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Person" hint={err('personName')}>
            {(fid) => (
              <Input
                id={fid}
                value={draft.personName}
                onChange={(e) => set('personName', e.target.value)}
                required
              />
            )}
          </Field>
          <Field label="Company" hint={err('companyId')}>
            {(fid) => (
              <select
                id={fid}
                className={selectClass}
                value={draft.companyId}
                onChange={(e) => set('companyId', e.target.value)}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Move type">
            {(fid) => (
              <select
                id={fid}
                className={selectClass}
                value={draft.moveType}
                onChange={(e) => set('moveType', e.target.value as Draft['moveType'])}
              >
                <option value="appointed">Appointed</option>
                <option value="departed">Departed</option>
                <option value="promoted">Promoted</option>
              </select>
            )}
          </Field>
          <Field label="Effective date" hint={err('effectiveDate')}>
            {(fid) => (
              <Input
                id={fid}
                type="date"
                value={draft.effectiveDate}
                onChange={(e) => set('effectiveDate', e.target.value)}
                required
              />
            )}
          </Field>
          <Field label="Title" hint={err('title')}>
            {(fid) => (
              <Input
                id={fid}
                value={draft.title}
                onChange={(e) => set('title', e.target.value)}
                required
              />
            )}
          </Field>
          <Field label="Previous role" hint={err('previousRole')}>
            {(fid) => (
              <Input
                id={fid}
                value={draft.previousRole}
                onChange={(e) => set('previousRole', e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field
          label="Summary"
          hint={err('summary') ?? 'One paragraph. What happened, and why it matters.'}
        >
          {(fid) => (
            <Textarea
              id={fid}
              rows={4}
              value={draft.summary}
              onChange={(e) => set('summary', e.target.value)}
            />
          )}
        </Field>

        <fieldset className="flex flex-col gap-4">
          <legend className="label-mono mb-2">Sources · at least one</legend>
          {draft.sources.map((s, i) => (
            <div
              key={i}
              className="grid gap-3 rounded-control border border-line p-4 md:grid-cols-[2fr_1fr_auto] md:items-end"
            >
              <Field label={`Source ${i + 1} URL`} hint={err(`sources.${i}.url`)}>
                {(fid) => (
                  <Input
                    id={fid}
                    type="url"
                    value={s.url}
                    onChange={(e) => setSource(i, { url: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Kind">
                {(fid) => (
                  <select
                    id={fid}
                    className={selectClass}
                    value={s.kind}
                    onChange={(e) => setSource(i, { kind: e.target.value as Kind })}
                  >
                    <option value="newsroom">Newsroom</option>
                    <option value="wire">Press wire</option>
                    <option value="edgar">SEC EDGAR</option>
                    <option value="submission">Submission</option>
                  </select>
                )}
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={draft.sources.length <= 1}
                onClick={() =>
                  set(
                    'sources',
                    draft.sources.filter((_, j) => j !== i),
                  )
                }
                aria-label={`Remove source ${i + 1}`}
              >
                Remove
              </Button>
              <div className="md:col-span-3">
                <Field label="Label" hint={err(`sources.${i}.label`)}>
                  {(fid) => (
                    <Input
                      id={fid}
                      value={s.label}
                      onChange={(e) => setSource(i, { label: e.target.value })}
                    />
                  )}
                </Field>
              </div>
            </div>
          ))}
          {err('sources') ? <p className="text-small text-critical-ink">{err('sources')}</p> : null}
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                set('sources', [...draft.sources, { url: '', label: '', kind: 'newsroom' }])
              }
            >
              Add source
            </Button>
          </div>
        </fieldset>

        {state?.message ? (
          <p role="status" aria-live="polite">
            <Status tone={state.ok ? 'good' : 'critical'}>{state.message}</Status>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3 border-t border-line pt-6">
          <Button
            type="button"
            variant="human"
            disabled={pending}
            onClick={() => run(() => approveMoveAction(id, edit))}
          >
            Approve and publish
          </Button>
          <Button type="submit" variant="secondary" disabled={pending}>
            Save draft
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => setRejecting((v) => !v)}
            aria-expanded={rejecting}
          >
            Reject
          </Button>
        </div>

        {rejecting ? (
          <div className="flex flex-col gap-3 rounded-control border border-critical/40 p-4">
            <Field
              label="Why reject it?"
              hint={
                state && !state.ok && rejecting ? state.message : 'The note stays with the draft.'
              }
            >
              {(fid) => (
                <Textarea
                  id={fid}
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
                onClick={() => run(() => rejectMoveAction(id, note))}
              >
                Confirm rejection
              </Button>
            </div>
          </div>
        ) : null}
      </form>
    </MeshPanel>
  );
}
