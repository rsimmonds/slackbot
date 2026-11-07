'use client';

import { Button, ConsentGate, cn, Input, MonoLabel, Status } from '@cmobeat/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { callApi } from './api';

type Visibility = 'hidden' | 'anonymous' | 'open';
type Terms = Record<
  Visibility,
  { label: string; summary: string; disclosures: { recipient: string; fields: string[] }[] }
>;
const rank: Record<Visibility, number> = { hidden: 0, anonymous: 1, open: 2 };

export function VisibilityControl({ current, terms }: { current: Visibility; terms: Terms }) {
  const router = useRouter();
  const [pending, setPending] = useState<Visibility | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = useId();

  async function apply(to: Visibility, consent: boolean) {
    setBusy(true);
    setError(null);
    const r = await callApi('/api/profiles/visibility', {
      method: 'PATCH',
      body: { visibility: to, consent },
    });
    setBusy(false);
    if (r.error) setError(r.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="radiogroup"
        aria-label="Who can see your profile"
        className="grid gap-3 md:grid-cols-3"
      >
        {(Object.keys(terms) as Visibility[]).map((v) => {
          const selected = v === current;
          return (
            <label
              key={v}
              className={cn(
                'mesh flex cursor-pointer flex-col gap-3 p-5 transition-colors duration-[240ms]',
                selected && 'border-filament/60',
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name={name}
                    value={v}
                    checked={selected}
                    disabled={busy}
                    onChange={() => (rank[v] > rank[current] ? setPending(v) : apply(v, false))}
                    className="accent-[var(--filament-ink)]"
                  />
                  <span className="text-body text-text">{terms[v].label}</span>
                </span>
                {selected ? <Status tone="human">Current</Status> : null}
              </span>
              <span className="text-small text-text-2">{terms[v].summary}</span>
            </label>
          );
        })}
      </div>
      <MonoLabel>
        Narrowing takes effect immediately. Widening asks for your consent first.
      </MonoLabel>
      {error ? (
        <p role="alert" className="text-small text-critical-ink">
          {error}
        </p>
      ) : null}
      <ConsentGate
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending ? `Change your profile to “${terms[pending].label}”?` : ''}
        consequence={pending ? terms[pending].summary : ''}
        disclosures={pending ? terms[pending].disclosures : []}
        confirmLabel="I consent"
        onConfirm={async () => {
          if (pending) await apply(pending, true);
          setPending(null);
        }}
      />
    </div>
  );
}

interface Company {
  id: string;
  name: string;
  industry: string;
}
interface Blocked {
  companyId: string;
  name: string;
  industry: string;
  isCurrentEmployer: boolean;
}

export function BlocklistManager({
  initial,
}: {
  initial: { currentEmployer: { id: string; name: string } | null; blocked: Blocked[] };
}) {
  const [state, setState] = useState(initial);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const searchId = useId();

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const r = await callApi<Company[]>(`/api/profiles/companies?q=${encodeURIComponent(q)}`);
      setResults(r.data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  async function run(p: Promise<{ data?: typeof initial; error?: string }>) {
    const r = await p;
    if (r.error) setError(r.error);
    else if (r.data) {
      setError(null);
      setState(r.data);
    }
  }

  const blockedIds = new Set(state.blocked.map((b) => b.companyId));
  const shown = q.trim().length >= 2 ? results : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor={searchId} className="label-mono">
          Find a company
        </label>
        <Input
          id={searchId}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Company name"
          autoComplete="off"
        />
        {shown.length ? (
          <ul
            className="flex flex-col divide-y divide-line rounded-control border border-line"
            aria-label="Search results"
          >
            {shown.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
              >
                <span className="text-small text-text">
                  {c.name} <span className="text-text-3">· {c.industry}</span>
                </span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={blockedIds.has(c.id)}
                    onClick={() =>
                      run(
                        callApi('/api/profiles/blocklist', {
                          method: 'POST',
                          body: { companyId: c.id },
                        }),
                      )
                    }
                  >
                    {blockedIds.has(c.id) ? 'Blocked' : 'Block'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      run(
                        callApi('/api/profiles/current-employer', {
                          method: 'PUT',
                          body: { companyId: c.id },
                        }),
                      )
                    }
                  >
                    My current employer
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="label-mono">Never shown to</span>
        {state.blocked.length === 0 ? (
          <p className="text-small text-text-3">No companies blocked yet.</p>
        ) : (
          <ul
            className="flex flex-col divide-y divide-line border-y border-line"
            aria-label="Blocked companies"
          >
            {state.blocked.map((b) => (
              <li
                key={b.companyId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span className="flex flex-col">
                  <span className="text-small text-text">{b.name}</span>
                  <MonoLabel>
                    {b.isCurrentEmployer ? 'Current employer · always blocked' : b.industry}
                  </MonoLabel>
                </span>
                {b.isCurrentEmployer ? null : (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Unblock ${b.name}`}
                    onClick={() =>
                      run(
                        callApi(`/api/profiles/blocklist?companyId=${b.companyId}`, {
                          method: 'DELETE',
                        }),
                      )
                    }
                  >
                    Unblock
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-small text-critical-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
