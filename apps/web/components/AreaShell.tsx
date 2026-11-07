import { brand, type Role } from '@cmobeat/config';
import { MonoLabel } from '@cmobeat/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Area } from '@/lib/areas';
import { getConsent } from '@/lib/consent/server';
import { resolveTheme } from '@/lib/theme';
import { CookieBanner } from './legal/CookieBanner';
import { CommandMenu, type NavCommand } from './CommandMenu';
import { MobileNav } from './MobileNav';
import { SignOutButton } from './SignOutButton';
import { ThemeControl } from './ThemeControl';
import { Wordmark } from './Wordmark';

export interface NavLink {
  href: string;
  label: string;
}

const areaLabel: Record<Area, string> = {
  public: 'Publication',
  reader: 'Account',
  candidate: 'Candidate',
  employer: 'Employer',
  staff: 'Staff console',
};

const roleLabel: Record<Role, string> = {
  reader: 'Reader',
  candidate: 'Candidate',
  employer: 'Employer',
  editor: 'Editor',
  talent_partner: 'Talent partner',
  admin: 'Admin',
};

const publicationCommands: NavCommand[] = [
  { id: 'home', label: 'Home', group: 'Publication', href: '/' },
  { id: 'jobs', label: 'Jobs', group: 'Publication', href: '/jobs' },
  {
    id: 'moves',
    label: 'CMO Moves',
    group: 'Publication',
    href: '/moves',
    keywords: ['appointments', 'departures'],
  },
  { id: 'articles', label: 'Stories', group: 'Publication', href: '/articles' },
  {
    id: 'interviews',
    label: 'Interviews',
    group: 'Publication',
    href: '/interviews',
    keywords: ['mandate'],
  },
  {
    id: 'data',
    label: 'Data',
    group: 'Publication',
    href: '/data',
    keywords: ['comp', 'tenure', 'charts'],
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    group: 'Publication',
    href: '/newsletter',
    keywords: ['subscribe'],
  },
];

function commandsFor(roles: readonly Role[] | undefined): NavCommand[] {
  const items: NavCommand[] = [...publicationCommands];
  if (!roles)
    return [...items, { id: 'signin', label: 'Sign in', group: 'Account', href: '/sign-in' }];
  items.push({ id: 'account', label: 'Account', group: 'Account', href: '/account' });
  if (roles.includes('candidate'))
    items.push({ id: 'me', label: 'Candidate dashboard', group: 'Candidate', href: '/me' });
  if (roles.includes('employer'))
    items.push({
      id: 'employer',
      label: 'Employer dashboard',
      group: 'Employer',
      href: '/employer',
    });
  if (roles.some((r) => r === 'editor' || r === 'talent_partner' || r === 'admin'))
    items.push({ id: 'console', label: 'Staff console', group: 'Staff', href: '/console' });
  return items;
}

/**
 * Every page sits in one of these. It scopes the theme (Lab for public, Retreat for private areas,
 * overridable), and carries the header, Cmd+K, and the film grain.
 */
export async function AreaShell({
  area,
  nav,
  viewer,
  children,
}: {
  area: Area;
  nav: NavLink[];
  viewer?: { name: string; roles: Role[] } | null;
  children: ReactNode;
}) {
  const { theme, preference } = await resolveTheme(area);
  return (
    <div data-theme={theme} data-area={area} className="grain relative min-h-dvh overflow-x-clip">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="volumetric" />
      </div>
      <header className="sticky top-0 z-40 border-b border-line bg-[var(--glass)] backdrop-blur-[20px]">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-4 px-4 md:gap-6 md:px-8">
          <Wordmark />
          <MonoLabel className="hidden md:inline">{areaLabel[area]}</MonoLabel>
          <nav aria-label={areaLabel[area]} className="ml-auto hidden items-center gap-6 md:flex">
            {nav.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-small text-text-2 transition-colors hover:text-text"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <MobileNav nav={nav} label={areaLabel[area]} />
            <kbd className="label-mono hidden rounded-control border border-line px-1.5 py-0.5 lg:inline">
              ⌘K
            </kbd>
            <span className="hidden sm:contents">
              <ThemeControl value={preference} />
            </span>
            {viewer ? (
              <div className="flex items-center gap-3">
                <span className="hidden flex-col text-right leading-tight sm:flex">
                  <span className="text-micro text-text">{viewer.name}</span>
                  <span className="label-mono text-[10px]">
                    {viewer.roles.map((r) => roleLabel[r]).join(' · ')}
                  </span>
                </span>
                <SignOutButton />
              </div>
            ) : (
              <Link href="/sign-in" className="text-small text-text-2 hover:text-text">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <CommandMenu items={commandsFor(viewer?.roles)} />
      {children}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-4 py-8 md:px-8">
          <MonoLabel>
            {brand.name} · {new Date().getFullYear()}
          </MonoLabel>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/newsletter" className="label-mono hover:text-text">
              Newsletter
            </Link>
            <Link href="/newsletter/archive" className="label-mono hover:text-text">
              Archive
            </Link>
            <a href="/feed.xml" className="label-mono hover:text-text">
              RSS
            </a>
            <a href="/llms.txt" className="label-mono hover:text-text">
              llms.txt
            </a>
          </nav>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/legal/privacy" className="label-mono hover:text-text">
              Privacy
            </Link>
            <Link href="/legal/terms" className="label-mono hover:text-text">
              Terms
            </Link>
            <Link href="/legal/ai" className="label-mono hover:text-text">
              How we use AI
            </Link>
            <Link href="/legal/subprocessors" className="label-mono hover:text-text">
              Subprocessors
            </Link>
            <Link href="/legal/cookies" className="label-mono hover:text-text">
              Cookie settings
            </Link>
          </nav>
          <MonoLabel>Sample data only. All companies and people are fictional.</MonoLabel>
          <span className="sm:hidden">
            <ThemeControl value={preference} />
          </span>
        </div>
        <CookieBanner decided={(await getConsent()).decided} />
      </footer>
    </div>
  );
}
