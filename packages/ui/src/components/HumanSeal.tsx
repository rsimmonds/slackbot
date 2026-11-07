import { cn } from '../lib/cn';

/** Amber seal marking a human decision. Shown only after a person has approved. */
export function HumanSeal({
  reviewer,
  at,
  label = 'Human review',
  className,
}: {
  reviewer: string;
  at: string | Date;
  label?: string;
  className?: string;
}) {
  const date = new Date(at).toISOString().slice(0, 10);
  return (
    <div
      className={cn(
        'inline-flex items-center gap-3 rounded-control border border-filament/50 bg-filament-glow px-3 py-2',
        className,
      )}
    >
      <svg aria-hidden width="18" height="18" viewBox="0 0 18 18">
        <circle cx="9" cy="9" r="8" fill="none" stroke="var(--filament)" />
        <circle cx="9" cy="9" r="5.5" fill="none" stroke="var(--filament)" strokeDasharray="1 2" />
        <path d="M6 9.2 8 11l4-4.5" fill="none" stroke="var(--filament)" strokeWidth="1.4" />
      </svg>
      <span className="flex flex-col">
        <span className="label-mono text-filament-ink">{label}</span>
        <span className="text-micro text-text-2">
          {reviewer} · {date}
        </span>
      </span>
    </div>
  );
}
