import type { ReactNode } from 'react';
import { niceTicks } from '@/lib/publication/chart-math';

/*
 * Server-rendered charts in HTML and CSS: legible at phone width (text never scales down with a
 * viewBox) and theme-aware through the design tokens. Single-series charts use one neutral ink
 * (--text-2): blue and amber carry meaning elsewhere (machine and human) and are not used for
 * data. Every chart has a native per-mark tooltip and a table view.
 */

const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;

export function ChartFigure({
  title,
  subtitle,
  children,
  table,
  note,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  table: ReactNode;
  note?: ReactNode;
}) {
  return (
    <figure className="mesh flex flex-col gap-6 p-6">
      <figcaption className="flex flex-col gap-1">
        <span className="text-h4 font-medium text-text">{title}</span>
        {subtitle ? <span className="text-small text-text-2">{subtitle}</span> : null}
      </figcaption>
      {children}
      <details className="group border-t border-line pt-3">
        <summary className="label-mono cursor-pointer hover:text-text">Show as table</summary>
        <div className="mt-3 overflow-x-auto">{table}</div>
      </details>
      {note ? <p className="text-micro text-text-3">{note}</p> : null}
    </figure>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-small">
      <thead>
        <tr className="border-b border-line">
          {head.map((h, i) => (
            <th
              key={h}
              scope="col"
              className={`label-mono py-2 font-normal ${i > 0 ? 'text-right' : ''}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r[0])} className="border-b border-line">
            {r.map((c, i) =>
              i === 0 ? (
                <th key={i} scope="row" className="py-2 font-normal text-text">
                  {c}
                </th>
              ) : (
                <td key={i} className="numeric py-2 text-right text-text-2">
                  {c}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Gridlines({ ticks, max }: { ticks: number[]; max: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {ticks.map((t) => (
        <span key={t} className="absolute inset-y-0 w-px bg-line" style={{ left: pct(t, max) }} />
      ))}
    </div>
  );
}

function AxisLabels({
  ticks,
  max,
  format,
}: {
  ticks: number[];
  max: number;
  format: (n: number) => string;
}) {
  return (
    <div aria-hidden className="relative h-4">
      {ticks.map((t, i) => (
        <span
          key={t}
          className="numeric absolute top-0 text-micro text-text-3"
          style={{
            left: pct(t, max),
            transform:
              i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
          }}
        >
          {format(t)}
        </span>
      ))}
    </div>
  );
}

/** Horizontal bars: one row per category, value at the bar tip, rounded data end. */
export function HorizontalBars({
  rows,
  unit,
  format = (n) => n.toLocaleString('en-US'),
}: {
  rows: { label: string; value: number }[];
  unit: string;
  format?: (n: number) => string;
}) {
  const ticks = niceTicks(Math.max(1, ...rows.map((r) => r.value)));
  const max = ticks.at(-1)!;
  return (
    <div
      role="img"
      aria-label={`Bar chart. ${rows.map((r) => `${r.label}: ${format(r.value)} ${unit}`).join('; ')}.`}
    >
      <div
        className="grid grid-cols-1 items-center gap-x-4 sm:grid-cols-[minmax(6rem,11rem)_1fr]"
        aria-hidden
      >
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <span className="truncate pt-2 text-small text-text-2 sm:py-1" title={r.label}>
              {r.label}
            </span>
            <div className="relative h-7">
              <Gridlines ticks={ticks} max={max} />
              <div className="absolute inset-y-0 left-0 right-10 flex items-center">
                <span
                  className="block h-4 rounded-r-[4px] bg-text-2 transition-opacity hover:opacity-80"
                  style={{ width: pct(r.value, max) }}
                  title={`${r.label}: ${format(r.value)} ${unit}`}
                />
                <span className="numeric ml-2 text-micro text-text">{format(r.value)}</span>
              </div>
            </div>
          </div>
        ))}
        <span className="hidden sm:block" />
        <div className="relative mt-1 mr-10">
          <AxisLabels ticks={ticks} max={max} format={format} />
        </div>
      </div>
    </div>
  );
}

/**
 * Range chart: a hairline whisker from the lowest to the highest listing, and a band from the
 * median minimum to the median maximum. One currency and one pay basis per chart, so ranges in
 * different currencies never share an axis.
 */
export function RangeBars({
  rows,
  format,
}: {
  rows: {
    label: string;
    low: number;
    high: number;
    bandLow: number;
    bandHigh: number;
    n: number;
  }[];
  format: (n: number) => string;
}) {
  const ticks = niceTicks(Math.max(...rows.map((r) => r.high)));
  const max = ticks.at(-1)!;
  return (
    <div
      role="img"
      aria-label={`Range chart. ${rows
        .map(
          (r) =>
            `${r.label}: median ${format(r.bandLow)} to ${format(r.bandHigh)}, full range ${format(r.low)} to ${format(r.high)}, ${r.n} listings`,
        )
        .join('; ')}.`}
    >
      <div
        className="grid grid-cols-1 items-center gap-x-4 sm:grid-cols-[minmax(6rem,10rem)_1fr]"
        aria-hidden
      >
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <span className="flex items-baseline gap-3 pt-3 sm:flex-col sm:items-start sm:gap-0 sm:py-2">
              <span className="text-small text-text-2">{r.label}</span>
              <span className="numeric text-micro text-text-3">
                {format(r.bandLow)}–{format(r.bandHigh)}
              </span>
            </span>
            <div
              className="relative h-10"
              title={`${r.label}: median ${format(r.bandLow)}–${format(r.bandHigh)} (${r.n} listings; full range ${format(r.low)}–${format(r.high)})`}
            >
              <Gridlines ticks={ticks} max={max} />
              <span
                className="absolute top-1/2 h-px -translate-y-1/2 bg-text-3"
                style={{ left: pct(r.low, max), width: pct(r.high - r.low, max) }}
              />
              <span
                className="absolute top-1/2 h-2 -translate-y-1/2 rounded-[4px] bg-text-2"
                style={{
                  left: pct(r.bandLow, max),
                  width: `max(4px, ${pct(r.bandHigh - r.bandLow, max)})`,
                }}
              />
            </div>
          </div>
        ))}
        <span className="hidden sm:block" />
        <div className="mt-1">
          <AxisLabels ticks={ticks} max={max} format={format} />
        </div>
      </div>
    </div>
  );
}

/** Histogram: one column per bin, 2px surface gap, rounded top, year labels below. */
export function Histogram({
  bins,
  binWidth,
  unit,
}: {
  bins: readonly (readonly [number, number])[];
  binWidth: number;
  unit: string;
}) {
  const ticks = niceTicks(Math.max(...bins.map(([, n]) => n)));
  const max = ticks.at(-1)!;
  const label = ([lo]: readonly [number, number]) => `${lo}–${lo + binWidth} ${unit}`;
  return (
    <div
      role="img"
      aria-label={`Histogram. ${bins.map((b) => `${label(b)}: ${b[1]}`).join('; ')}.`}
    >
      <div aria-hidden className="relative ml-8 h-48">
        {ticks.map((t) => (
          <span key={t} className="absolute inset-x-0 h-px bg-line" style={{ bottom: pct(t, max) }}>
            <span className="numeric absolute -top-2 right-full mr-2 text-micro text-text-3">
              {t}
            </span>
          </span>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {bins.map((b) => (
            <span
              key={b[0]}
              className="block flex-1 rounded-t-[4px] bg-text-2 transition-opacity hover:opacity-80"
              style={{ height: pct(b[1], max) }}
              title={`${label(b)}: ${b[1]} seats`}
            />
          ))}
        </div>
      </div>
      <div aria-hidden className="mt-2 ml-8 flex">
        {bins.map(([lo]) => (
          <span key={lo} className="numeric flex-1 text-micro text-text-3">
            {Number.isInteger(lo) ? lo : ''}
          </span>
        ))}
      </div>
      <p aria-hidden className="label-mono mt-1 text-right">
        Years in seat
      </p>
    </div>
  );
}
