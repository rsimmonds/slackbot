import { MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader, PublicPage } from '@/components/publication/PageHeader';

export const legalLinks = [
  { href: '/legal/privacy', label: 'Privacy' },
  { href: '/legal/terms', label: 'Terms' },
  { href: '/legal/cookies', label: 'Cookies' },
  { href: '/legal/subprocessors', label: 'Subprocessors' },
  { href: '/legal/ai', label: 'How we use AI' },
] as const;

/**
 * Frame for every legal page: plain language, a visible draft marker until counsel signs off,
 * and a last-updated date.
 */
export function LegalPage({
  title,
  lede,
  updated,
  current,
  children,
}: {
  title: string;
  lede: ReactNode;
  updated: string;
  current: (typeof legalLinks)[number]['href'];
  children: ReactNode;
}) {
  return (
    <PublicPage>
      <PageHeader
        eyebrow="Legal"
        title={title}
        lede={lede}
        aside={
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <Status tone="human">Draft — pending legal review</Status>
            <MonoLabel>Updated {updated}</MonoLabel>
          </div>
        }
      />
      <div className="mt-10 grid grid-cols-12 gap-8">
        <nav aria-label="Legal pages" className="col-span-12 lg:col-span-3">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 lg:flex-col">
            {legalLinks.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={l.href === current ? 'page' : undefined}
                  className="text-small text-text-2 hover:text-text aria-[current=page]:text-text aria-[current=page]:underline aria-[current=page]:underline-offset-4"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="col-span-12 max-w-[68ch] lg:col-span-8 lg:col-start-5">{children}</div>
      </div>
    </PublicPage>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <section aria-labelledby={id} className="mb-12">
      <h2 id={id} className="mb-4 font-serif text-h3 text-text">
        {title}
      </h2>
      <div className="flex flex-col gap-4 text-body text-text-2 [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-text">
        {children}
      </div>
    </section>
  );
}

/** Marks text that counsel must confirm before launch. */
export function Counsel({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-control border border-filament/50 px-1.5 py-0.5 text-small text-filament-ink">
      For counsel: {children}
    </span>
  );
}
