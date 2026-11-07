import { DataCard } from '@cmobeat/ui';
import type { ReactNode } from 'react';

/**
 * The only components editors can use inside article MDX. Anything else in the source is
 * rendered as text. JavaScript expressions are blocked by the renderer.
 */
export function PullQuote({ children, cite }: { children: ReactNode; cite?: string }) {
  return (
    <figure className="my-12 border-l border-filament/60 pl-6 md:-ml-6">
      <blockquote className="font-serif text-h3 leading-snug text-text">{children}</blockquote>
      {cite ? <figcaption className="label-mono mt-3">{cite}</figcaption> : null}
    </figure>
  );
}

export function Stat({
  value,
  label,
  unit,
  footnote,
}: {
  value: string;
  label: string;
  unit?: string;
  footnote?: string;
}) {
  return (
    <div className="my-10 max-w-sm">
      <DataCard value={value} label={label} unit={unit} footnote={footnote} />
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <aside className="my-8 rounded-panel border border-line bg-surface p-5 text-small text-text-2">
      {children}
    </aside>
  );
}

export const mdxComponents = {
  PullQuote,
  Stat,
  Note,
  h2: (p: { children?: ReactNode }) => (
    <h2 className="mt-14 mb-4 font-serif text-h3 text-text">{p.children}</h2>
  ),
  h3: (p: { children?: ReactNode }) => (
    <h3 className="mt-10 mb-3 text-h4 font-medium text-text">{p.children}</h3>
  ),
  p: (p: { children?: ReactNode }) => <p className="my-5 text-body text-text-2">{p.children}</p>,
  ul: (p: { children?: ReactNode }) => (
    <ul className="my-5 list-disc space-y-2 pl-6 text-text-2 marker:text-text-3">{p.children}</ul>
  ),
  ol: (p: { children?: ReactNode }) => (
    <ol className="my-5 list-decimal space-y-2 pl-6 text-text-2 marker:text-text-3">
      {p.children}
    </ol>
  ),
  a: (p: { href?: string; children?: ReactNode }) => (
    <a
      href={p.href}
      className="text-text underline decoration-line-strong underline-offset-4 hover:decoration-text"
      rel={p.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      {p.children}
    </a>
  ),
  blockquote: (p: { children?: ReactNode }) => (
    <blockquote className="my-8 border-l border-line-strong pl-5 text-text-2 italic">
      {p.children}
    </blockquote>
  ),
  hr: () => <hr className="my-12 border-line" />,
  strong: (p: { children?: ReactNode }) => (
    <strong className="font-medium text-text">{p.children}</strong>
  ),
};
