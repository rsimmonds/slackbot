import { MonoLabel } from '@cmobeat/ui';
import type { ReactNode } from 'react';

/** Public page frame: 1280 max, 12-column grid, asymmetric serif header. */
export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <main className="relative mx-auto max-w-[1280px] px-4 pt-12 pb-24 md:px-8 md:pt-16">
      {children}
    </main>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-12 gap-6 border-b border-line pb-10 md:gap-8">
      <div className="col-span-12 flex flex-col gap-4 lg:col-span-8">
        <MonoLabel>{eyebrow}</MonoLabel>
        <h1 className="font-serif text-h1 text-text md:text-display">{title}</h1>
        {lede ? <p className="max-w-2xl text-body text-text-2">{lede}</p> : null}
      </div>
      {aside ? (
        <div className="col-span-12 flex items-end lg:col-span-4 lg:justify-end">{aside}</div>
      ) : null}
    </header>
  );
}

/** Small labelled note that the figures are fictional sample data. */
export function SampleNote({
  children = 'Sample data. All companies and people are fictional.',
}: {
  children?: ReactNode;
}) {
  return <p className="label-mono text-text-3">{children}</p>;
}
