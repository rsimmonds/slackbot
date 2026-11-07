'use client';

import { Button, cn, Input, MonoLabel, Status, Textarea } from '@cmobeat/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ReviewLine } from '@/lib/profile/review';
import { callApi } from './api';

type Action = 'approve' | 'edit' | 'remove';
type Decision = { action: Action; value?: unknown };

const levelLabel = {
  vp_marketing: 'VP Marketing',
  cmo: 'CMO',
  chief_growth_officer: 'Chief Growth Officer',
  fractional_cmo: 'Fractional CMO',
} as const;
const marketLabel = { US: 'US', CA: 'Canada', EU: 'Europe', UK: 'UK' } as const;
const workLabel = { full_time: 'Full-time', fractional: 'Fractional' } as const;
const list = (xs: string[]) => (xs.length ? xs.join(', ') : 'None');
const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function heading(line: ReviewLine): string {
  switch (line.kind) {
    case 'role':
      return 'Role';
    case 'headline':
      return 'Headline';
    case 'outcome':
      return `Result · ${line.value.outcomeType.replace('_', ' ')}`;
    case 'team':
      return 'Team built';
    case 'ai':
      return 'How you use AI';
    case 'idealSummary':
      return 'Ideal next mandate';
    case 'idealFit':
      return 'Stages and industries';
    case 'idealTerms':
      return 'Work type and markets';
    case 'idealReporting':
      return 'Reports to';
    case 'idealDealBreakers':
      return 'Deal-breakers';
  }
}

function Display({ line, value }: { line: ReviewLine; value: unknown }) {
  switch (line.kind) {
    case 'role': {
      const v = value as { level: keyof typeof levelLabel; yearsExperience: number | null };
      return (
        <p className="text-body text-text">
          {levelLabel[v.level]}
          {v.yearsExperience !== null ? ` · ${v.yearsExperience} years leading marketing` : ''}
        </p>
      );
    }
    case 'outcome': {
      const v = value as {
        metric: string;
        value: string;
        context: string | null;
        evidenceNote: string | null;
      };
      return (
        <div className="flex flex-col gap-1">
          <p className="text-body text-text">
            {v.metric} <span className="numeric text-text">{v.value}</span>
          </p>
          {v.context ? <p className="text-small text-text-2">{v.context}</p> : null}
          {v.evidenceNote ? <MonoLabel>Evidence · {v.evidenceNote}</MonoLabel> : null}
        </div>
      );
    }
    case 'idealFit': {
      const v = value as { stages: string[]; industries: string[] };
      return (
        <p className="text-body text-text">
          {list(v.stages)} <span className="text-text-3">·</span> {list(v.industries)}
        </p>
      );
    }
    case 'idealTerms': {
      const v = value as {
        workTypes: (keyof typeof workLabel)[];
        markets: (keyof typeof marketLabel)[];
      };
      return (
        <p className="text-body text-text">
          {v.workTypes.map((w) => workLabel[w]).join(' or ')} <span className="text-text-3">·</span>{' '}
          {v.markets.map((m) => marketLabel[m]).join(', ')}
        </p>
      );
    }
    case 'idealDealBreakers':
      return <p className="text-body text-text">{list(value as string[])}</p>;
    case 'idealReporting':
      return <p className="text-body text-text">{(value as string | null) ?? 'No preference'}</p>;
    default:
      return <p className="text-body text-text">{String(value)}</p>;
  }
}

/** Text fields for editing a line. Structured values are edited as short comma-separated lists. */
function Editor({
  line,
  value,
  onChange,
}: {
  line: ReviewLine;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = `Edit ${heading(line).toLowerCase()}`;
  switch (line.kind) {
    case 'role': {
      const v = value as { level: keyof typeof levelLabel; yearsExperience: number | null };
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            aria-label="Level"
            value={v.level}
            onChange={(e) => onChange({ ...v, level: e.target.value })}
            className="h-10 rounded-control border border-line bg-surface px-3 text-small text-text"
          >
            {Object.entries(levelLabel).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <Input
            aria-label="Years leading marketing"
            type="number"
            min={0}
            max={60}
            value={v.yearsExperience ?? ''}
            onChange={(e) =>
              onChange({
                ...v,
                yearsExperience: e.target.value === '' ? null : Number(e.target.value),
              })
            }
          />
        </div>
      );
    }
    case 'outcome': {
      const v = value as Record<string, string | null>;
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            aria-label="What moved"
            value={v.metric ?? ''}
            onChange={(e) => onChange({ ...v, metric: e.target.value })}
          />
          <Input
            aria-label="By how much"
            value={v.value ?? ''}
            onChange={(e) => onChange({ ...v, value: e.target.value })}
          />
          <Input
            aria-label="Context, without naming the employer"
            className="sm:col-span-2"
            value={v.context ?? ''}
            onChange={(e) => onChange({ ...v, context: e.target.value || null })}
          />
        </div>
      );
    }
    case 'idealFit': {
      const v = value as { stages: string[]; industries: string[] };
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            aria-label="Stages, comma separated"
            defaultValue={v.stages.join(', ')}
            onChange={(e) => onChange({ ...v, stages: splitList(e.target.value) })}
          />
          <Input
            aria-label="Industries, comma separated"
            defaultValue={v.industries.join(', ')}
            onChange={(e) => onChange({ ...v, industries: splitList(e.target.value) })}
          />
        </div>
      );
    }
    case 'idealTerms': {
      const v = value as { workTypes: string[]; markets: string[] };
      const toggle = (key: 'workTypes' | 'markets', item: string) =>
        onChange({
          ...v,
          [key]: v[key].includes(item) ? v[key].filter((x) => x !== item) : [...v[key], item],
        });
      return (
        <fieldset className="flex flex-wrap gap-4">
          <legend className="sr-only">{label}</legend>
          {Object.entries(workLabel).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-small text-text">
              <input
                type="checkbox"
                checked={v.workTypes.includes(k)}
                onChange={() => toggle('workTypes', k)}
              />{' '}
              {l}
            </label>
          ))}
          {Object.entries(marketLabel).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-small text-text">
              <input
                type="checkbox"
                checked={v.markets.includes(k)}
                onChange={() => toggle('markets', k)}
              />{' '}
              {l}
            </label>
          ))}
        </fieldset>
      );
    }
    case 'idealDealBreakers':
      return (
        <Input
          aria-label="Deal-breakers, comma separated"
          defaultValue={(value as string[]).join(', ')}
          onChange={(e) => onChange(splitList(e.target.value))}
        />
      );
    case 'idealReporting':
      return (
        <Input
          aria-label={label}
          value={(value as string | null) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case 'headline':
      return (
        <Input
          aria-label={label}
          maxLength={140}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <Textarea
          aria-label={label}
          rows={3}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function ReviewForm({
  sessionId,
  lines,
  scrubbed,
}: {
  sessionId: string;
  lines: ReviewLine[];
  scrubbed: string[];
}) {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = useMemo(() => lines.filter((l) => !decisions[l.id]).length, [lines, decisions]);

  const set = (id: string, d: Decision | undefined) =>
    setDecisions((prev) => {
      const next = { ...prev };
      if (d) next[id] = d;
      else delete next[id];
      return next;
    });

  async function save() {
    setBusy(true);
    setError(null);
    const r = await callApi('/api/profiles/review', {
      method: 'POST',
      body: { sessionId, decisions: lines.map((l) => ({ id: l.id, ...decisions[l.id]! })) },
    });
    setBusy(false);
    if (r.error) setError(r.error);
    else router.push('/me/visibility?saved=1');
  }

  return (
    <div className="flex flex-col gap-6">
      {scrubbed.length ? (
        <p className="rounded-panel border border-line bg-surface p-4 text-small text-text-2">
          Some of your answers mentioned {scrubbed.join(', ')}. We left that out. It is never stored
          in your profile or used in matching.
        </p>
      ) : null}

      <ol className="flex flex-col gap-4" aria-label="Profile lines to review">
        {lines.map((line) => {
          const d = decisions[line.id];
          const value = d?.action === 'edit' ? d.value : line.value;
          return (
            <li
              key={line.id}
              className={cn('mesh p-5', d?.action === 'remove' && 'opacity-60')}
              data-line={line.id}
              aria-label={heading(line)}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="label-mono">{heading(line)}</span>
                {d ? (
                  <Status tone={d.action === 'remove' ? 'neutral' : 'human'}>
                    {d.action === 'approve'
                      ? 'Approved'
                      : d.action === 'edit'
                        ? 'Edited'
                        : 'Removed'}
                  </Status>
                ) : (
                  <Status tone="machine">Drafted from your answers</Status>
                )}
              </div>
              <div className="mt-3">
                {d?.action === 'edit' ? (
                  <Editor
                    line={line}
                    value={value}
                    onChange={(v) => set(line.id, { action: 'edit', value: v })}
                  />
                ) : (
                  <Display line={line} value={value} />
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={d?.action === 'approve' ? 'human' : 'secondary'}
                  aria-pressed={d?.action === 'approve'}
                  onClick={() =>
                    set(line.id, d?.action === 'approve' ? undefined : { action: 'approve' })
                  }
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-pressed={d?.action === 'edit'}
                  onClick={() =>
                    set(
                      line.id,
                      d?.action === 'edit' ? undefined : { action: 'edit', value: line.value },
                    )
                  }
                >
                  {d?.action === 'edit' ? 'Undo edit' : 'Edit'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-pressed={d?.action === 'remove'}
                  onClick={() =>
                    set(line.id, d?.action === 'remove' ? undefined : { action: 'remove' })
                  }
                >
                  {d?.action === 'remove' ? 'Keep' : 'Remove'}
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="sticky bottom-2 flex items-center justify-between gap-3 rounded-panel border border-line bg-surface-raised px-3 py-2 sm:bottom-4 sm:p-4">
        <span className="text-micro text-text-2 sm:text-small" role="status">
          {open ? (
            <>
              {open} line{open === 1 ? '' : 's'}{' '}
              <span className="hidden sm:inline">still need a decision</span>
              <span className="sm:hidden">to decide</span>
            </>
          ) : (
            'Every line has a decision.'
          )}
        </span>
        <div className="flex shrink-0 gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={open === 0}
            onClick={() =>
              setDecisions(
                Object.fromEntries(
                  lines.map((l) => [l.id, decisions[l.id] ?? { action: 'approve' as const }]),
                ),
              )
            }
          >
            Approve the rest
          </Button>
          <Button variant="human" size="sm" disabled={open > 0 || busy} onClick={save}>
            Save my profile
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-small text-critical-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
