'use client';

import { Command } from 'cmdk';
import { useEffect, useState } from 'react';

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  hint?: string;
  keywords?: string[];
}

export interface CommandPaletteProps {
  items: CommandItem[];
  onSelect: (item: CommandItem) => void;
  placeholder?: string;
  /** Controlled open state (optional). Cmd+K / Ctrl+K toggles it regardless. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Cmd+K everywhere for search and navigation. */
export function CommandPalette({
  items,
  onSelect,
  placeholder = 'Search or jump to…',
  open: controlled,
  onOpenChange,
}: CommandPaletteProps) {
  const [internal, setInternal] = useState(false);
  const open = controlled ?? internal;
  const setOpen = (v: boolean) => {
    setInternal(v);
    onOpenChange?.(v);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setInternal((v) => {
          onOpenChange?.(!v);
          return !v;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenChange]);

  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-bg/60 backdrop-blur-sm"
      contentClassName="mesh mesh-quiet fixed top-[18vh] left-1/2 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden p-0"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <span aria-hidden className="size-1.5 animate-breathe rounded-full bg-synapse" />
        <Command.Input
          placeholder={placeholder}
          className="h-12 w-full bg-transparent text-body text-text placeholder:text-text-3 focus:outline-none"
        />
        <kbd className="label-mono shrink-0">Esc</kbd>
      </div>
      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-small text-text-3">Nothing found.</Command.Empty>
        {groups.map((g) => (
          <Command.Group
            key={g}
            heading={g}
            className="[&_[cmdk-group-heading]]:label-mono [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1"
          >
            {items
              .filter((i) => i.group === g)
              .map((i) => (
                <Command.Item
                  key={i.id}
                  value={`${i.label} ${i.keywords?.join(' ') ?? ''}`}
                  onSelect={() => {
                    setOpen(false);
                    onSelect(i);
                  }}
                  className="flex cursor-pointer items-center justify-between rounded-control px-3 py-2 text-small text-text-2 data-[selected=true]:bg-concrete/70 data-[selected=true]:text-text"
                >
                  <span>{i.label}</span>
                  {i.hint ? <span className="label-mono">{i.hint}</span> : null}
                </Command.Item>
              ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
