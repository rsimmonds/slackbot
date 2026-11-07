import { MonoLabel } from '@cmobeat/ui';
import type { ReactNode } from 'react';

/** Page frame for dashboards: 12-col grid, 1280 max, asymmetric header. */
export function DashboardFrame({
  eyebrow,
  title,
  lede,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="relative mx-auto max-w-[1280px] px-4 pt-12 pb-24 md:px-8 md:pt-16">
      <div className="relative grid grid-cols-12 gap-6 md:gap-8">
        <header className="col-span-12 flex flex-col gap-4 md:col-span-8">
          <MonoLabel>{eyebrow}</MonoLabel>
          <h1 className="font-serif text-h2 text-text md:text-h1">{title}</h1>
          {lede ? <p className="max-w-2xl text-body text-text-2">{lede}</p> : null}
        </header>
        {aside ? (
          <div className="col-span-12 flex items-end md:col-span-4 md:justify-end">{aside}</div>
        ) : null}
        <div className="col-span-12 mt-4 grid grid-cols-12 gap-6">{children}</div>
      </div>
    </main>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="border-t border-line pt-4 text-small text-text-3">{children}</p>;
}
