'use client';

import { CommandPalette, type CommandItem } from '@cmobeat/ui';
import { useRouter } from 'next/navigation';

export interface NavCommand extends CommandItem {
  href: string;
}

export function CommandMenu({ items }: { items: NavCommand[] }) {
  const router = useRouter();
  return <CommandPalette items={items} onSelect={(i) => router.push((i as NavCommand).href)} />;
}
