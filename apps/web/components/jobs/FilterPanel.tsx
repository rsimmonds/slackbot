import { currencies, markets } from '@cmobeat/config';
import { Button, Input } from '@cmobeat/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Select } from '@/components/form/Select';
import {
  functionScopes,
  levels,
  workTypes,
  type FunctionScope,
  type JobFilters,
} from '@/lib/jobs/filters';
import { levelLabel, marketLabel, scopeLabel, workTypeLabel } from '@/lib/jobs/format';

function Row({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label-mono">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Plain GET form, so filters work without JavaScript and every result page has a shareable URL.
 */
export function FilterPanel({
  filters,
  facets,
}: {
  filters: JobFilters;
  facets: { stages: string[]; industries: string[] };
}) {
  return (
    <form
      method="get"
      action="/jobs"
      role="search"
      aria-label="Filter roles"
      className="flex flex-col gap-5"
    >
      <Row id="f-q" label="Keywords">
        <Input
          id="f-q"
          name="q"
          type="search"
          defaultValue={filters.q}
          placeholder="Brand, fintech, Series C…"
        />
      </Row>
      <Row id="f-level" label="Level">
        <Select id="f-level" name="level" defaultValue={filters.level ?? ''}>
          <option value="">Any level</option>
          {levels.map((l) => (
            <option key={l} value={l}>
              {levelLabel[l]}
            </option>
          ))}
        </Select>
      </Row>
      <Row id="f-work" label="Work type">
        <Select id="f-work" name="work" defaultValue={filters.work ?? ''}>
          <option value="">Full-time or fractional</option>
          {workTypes.map((w) => (
            <option key={w} value={w}>
              {workTypeLabel[w]}
            </option>
          ))}
        </Select>
      </Row>
      <Row id="f-scope" label="Function scope">
        <Select id="f-scope" name="scope" defaultValue={filters.scope ?? ''}>
          <option value="">Any scope</option>
          {(Object.keys(functionScopes) as FunctionScope[]).map((s) => (
            <option key={s} value={s}>
              {scopeLabel[s]}
            </option>
          ))}
        </Select>
      </Row>
      <Row id="f-industry" label="Industry">
        <Select id="f-industry" name="industry" defaultValue={filters.industry ?? ''}>
          <option value="">Any industry</option>
          {facets.industries.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </Select>
      </Row>
      <Row id="f-stage" label="Company stage">
        <Select id="f-stage" name="stage" defaultValue={filters.stage ?? ''}>
          <option value="">Any stage</option>
          {facets.stages.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Row>
      <Row id="f-market" label="Location">
        <Select id="f-market" name="market" defaultValue={filters.market ?? ''}>
          <option value="">Anywhere</option>
          {markets.map((m) => (
            <option key={m} value={m}>
              {marketLabel[m]}
            </option>
          ))}
        </Select>
      </Row>
      <label className="flex items-center gap-3 text-small text-text-2">
        <input
          type="checkbox"
          name="remote"
          value="1"
          defaultChecked={!!filters.remote}
          className="size-4 accent-[var(--text)]"
        />
        Remote only
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="label-mono mb-2">Minimum comp</legend>
        <div className="grid grid-cols-[96px_1fr] gap-2">
          <Select name="currency" aria-label="Currency" defaultValue={filters.currency ?? ''}>
            <option value="">—</option>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            name="minComp"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            aria-label="Minimum comp"
            defaultValue={filters.minComp}
            placeholder="e.g. 300000"
          />
        </div>
        <p className="text-micro text-text-3">
          Applies within one currency. Annual for full-time roles, monthly for fractional.
        </p>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit">Apply filters</Button>
        <Link href="/jobs" className="text-small text-text-2 hover:text-text">
          Clear
        </Link>
      </div>
    </form>
  );
}
