import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'human' | 'machine' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Render as the child element (e.g. a Next.js Link). */
  asChild?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-text text-bg hover:opacity-90',
  secondary: 'bg-transparent text-text border border-line-strong hover:border-text-3',
  ghost: 'bg-transparent text-text-2 hover:text-text hover:bg-concrete/60',
  /** Amber: a human decision (approve, consent, sign-off). */
  human: 'bg-filament-ink text-on-filament hover:opacity-90',
  /** Blue: start or steer an AI action. */
  machine: 'bg-transparent text-synapse-ink border border-synapse/50 hover:bg-synapse-glow',
  danger: 'bg-transparent text-critical-ink border border-critical/50 hover:bg-critical/10',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-micro',
  md: 'h-10 px-4 text-small',
  lg: 'h-12 px-6 text-body',
};

export function Button({
  variant = 'primary',
  size = 'md',
  asChild,
  className,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap',
        'transition-[background-color,border-color,opacity,color] duration-[240ms] ease-calm',
        'disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
