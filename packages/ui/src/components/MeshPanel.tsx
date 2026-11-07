import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface MeshPanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Small mono label in the panel header. */
  eyebrow?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
}

/** The default card: glass surface, hairline border, a hidden grid that surfaces on hover. */
export function MeshPanel({
  eyebrow,
  title,
  actions,
  padded = true,
  className,
  children,
  ...props
}: MeshPanelProps) {
  return (
    <section className={cn('mesh', padded && 'p-6', className)} {...props}>
      {eyebrow || title || actions ? (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            {eyebrow ? <span className="label-mono">{eyebrow}</span> : null}
            {title ? <h3 className="text-h4 font-medium text-text">{title}</h3> : null}
          </div>
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}
