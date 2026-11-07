import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type Tone = 'neutral' | 'machine' | 'human' | 'good' | 'critical';

const dot: Record<Tone, string> = {
  neutral: 'bg-text-3',
  machine: 'bg-synapse animate-breathe',
  human: 'bg-filament',
  good: 'bg-good',
  critical: 'bg-critical',
};
const ink: Record<Tone, string> = {
  neutral: 'text-text-3',
  machine: 'text-synapse-ink',
  human: 'text-filament-ink',
  good: 'text-good-ink',
  critical: 'text-critical-ink',
};

/** A mono status chip. Blue = machine at work, amber = human decision. */
export function Status({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('label-mono inline-flex items-center gap-2', ink[tone], className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', dot[tone])} />
      {children}
    </span>
  );
}
