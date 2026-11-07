import { brand } from '@cmobeat/config';
import Link from 'next/link';

/** Wordmark: serif name with a single synapse point, the system's quiet pulse. */
export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex shrink-0 items-baseline gap-2 whitespace-nowrap"
      aria-label={`${brand.name} home`}
    >
      <span className="font-serif text-h4 leading-none tracking-tight text-text">{brand.name}</span>
      <span
        aria-hidden
        className="size-1.5 translate-y-[-2px] animate-breathe rounded-full bg-synapse"
      />
    </Link>
  );
}
