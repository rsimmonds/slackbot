import { cn } from '../lib/cn';

export interface DataCardProps {
  value: string;
  label: string;
  /** Optional series for a quiet sparkline. */
  series?: number[];
  unit?: string;
  footnote?: string;
  className?: string;
}

function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) return null;
  const w = 120;
  const h = 28;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pts = series
    .map(
      (v, i) =>
        `${((i / (series.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${h}`}
      className="h-7 w-full max-w-[120px] min-w-12 shrink overflow-visible"
      preserveAspectRatio="none"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="var(--text-3)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Large mono numerals, a one-line label, a quiet sparkline. */
export function DataCard({ value, label, series, unit, footnote, className }: DataCardProps) {
  return (
    <figure className={cn('mesh flex flex-col gap-3 p-6', className)}>
      <figcaption className="label-mono">{label}</figcaption>
      <div className="flex flex-col gap-3">
        <span className="numeric text-h2 leading-none text-text xl:text-h1">
          {value}
          {unit ? <span className="ml-1 text-h4 text-text-2">{unit}</span> : null}
        </span>
        {series ? <Sparkline series={series} /> : null}
      </div>
      {footnote ? <p className="text-micro text-text-3">{footnote}</p> : null}
    </figure>
  );
}
