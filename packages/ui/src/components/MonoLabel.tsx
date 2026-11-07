import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/** System voice. Uppercase Geist Mono, 11px, 0.12em tracking. */
export function MonoLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('label-mono', className)} {...props} />;
}
