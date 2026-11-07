import { cn } from '@cmobeat/ui';
import type { SelectHTMLAttributes } from 'react';

/** Native select styled to match the design-system Input (same tokens, hairline, synapse focus). */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full appearance-none rounded-control border border-line bg-surface bg-[length:10px_6px] bg-[right_12px_center] bg-no-repeat px-3 pr-8 text-small text-text',
        "bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M1 1l4 4 4-4' fill='none' stroke='%238C9198'/></svg>\")]",
        'transition-[border-color,box-shadow] duration-[240ms] ease-calm hover:border-line-strong',
        'focus:border-synapse focus:shadow-[0_0_0_4px_var(--synapse-glow)] focus:outline-none',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
