import { cn } from '../lib/cn';

/**
 * Progress and loading: a single hairline with a travelling point of light.
 * Pass `value` (0–1) for determinate progress; omit for indeterminate.
 */
export function SignalLine({
  value,
  label = 'Loading',
  className,
}: {
  value?: number;
  label?: string;
  className?: string;
}) {
  const determinate = typeof value === 'number';
  const pct = determinate ? Math.round(Math.min(1, Math.max(0, value)) * 100) : undefined;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={pct}
      className={cn('relative h-px w-full overflow-hidden bg-line', className)}
    >
      {determinate ? (
        <span
          className="absolute inset-y-0 left-0 bg-synapse transition-[width] duration-[480ms] ease-calm"
          style={{ width: `${pct}%` }}
        >
          <span className="absolute -top-px right-0 h-[3px] w-6 rounded-full bg-synapse shadow-[0_0_12px_2px_var(--synapse-glow)]" />
        </span>
      ) : (
        <span className="animate-signal absolute -top-px h-[3px] w-[8%] rounded-full bg-synapse shadow-[0_0_12px_2px_var(--synapse-glow)]" />
      )}
    </div>
  );
}
