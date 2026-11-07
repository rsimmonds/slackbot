'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { NavLink } from './AreaShell';

/**
 * Navigation below the md breakpoint. A Radix dialog gives focus trapping, Escape to close and
 * correct screen-reader semantics; links close the sheet on navigation.
 */
export function MobileNav({ nav, label }: { nav: NavLink[]; label: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  if (nav.length === 0) return null;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className="label-mono rounded-control border border-line px-2 py-1 text-text-2 hover:text-text md:hidden"
        aria-label={`Open ${label} menu`}
      >
        Menu
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/70 backdrop-blur-sm md:hidden" />
        <Dialog.Content className="mesh mesh-quiet fixed inset-x-0 top-0 z-50 rounded-none border-x-0 border-t-0 p-0 md:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <Dialog.Title className="label-mono">{label}</Dialog.Title>
            <Dialog.Description className="sr-only">Site navigation</Dialog.Description>
            <Dialog.Close className="label-mono rounded-control border border-line px-2 py-1 text-text-2 hover:text-text">
              Close
            </Dialog.Close>
          </div>
          <nav aria-label={label} className="border-t border-line px-4 pb-6">
            <ul className="flex flex-col divide-y divide-line">
              {nav.map((l) => {
                const current = pathname === l.href || pathname.startsWith(`${l.href}/`);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      aria-current={current ? 'page' : undefined}
                      className="flex items-center justify-between py-4 font-serif text-h4 text-text"
                    >
                      {l.label}
                      {current ? (
                        <span aria-hidden className="size-1.5 rounded-full bg-text" />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
