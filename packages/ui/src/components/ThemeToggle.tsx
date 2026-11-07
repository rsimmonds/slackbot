'use client';

import { cn } from '../lib/cn';

export type ThemePreference = 'auto' | 'lab' | 'retreat';

const options: { value: ThemePreference; label: string }[] = [
  { value: 'lab', label: 'Lab' },
  { value: 'retreat', label: 'Retreat' },
  { value: 'auto', label: 'Auto' },
];

/** Lab (light) / Retreat (dark) / Auto (the area's default). */
export function ThemeToggle({
  value,
  onChange,
  className,
}: {
  value: ThemePreference;
  onChange: (v: ThemePreference) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn('inline-flex rounded-control border border-line p-0.5', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'label-mono rounded-[3px] px-2.5 py-1 transition-colors duration-[240ms]',
            value === o.value ? 'bg-concrete text-text' : 'hover:text-text-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
