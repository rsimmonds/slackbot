'use client';

import * as Checkbox from '@radix-ui/react-checkbox';
import * as Dialog from '@radix-ui/react-dialog';
import { useId, useState, type ReactNode } from 'react';
import { Button } from './Button';

export interface Disclosure {
  /** Who will see it, e.g. "Northwind Robotics hiring team (3 people)". */
  recipient: string;
  /** What they will see, e.g. ["Full name", "Email", "Current title"]. */
  fields: string[];
}

export interface ConsentGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  disclosures: Disclosure[];
  /** Plain statement of what happens next. */
  consequence: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}

/**
 * Any action that reveals a candidate's identity passes through here: an explicit amber
 * confirmation with a clear summary of who will see what. Confirm stays disabled until the
 * person ticks the acknowledgement.
 */
export function ConsentGate({
  open,
  onOpenChange,
  title,
  disclosures,
  consequence,
  confirmLabel = 'I consent',
  onConfirm,
}: ConsentGateProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const ackId = useId();

  const change = (next: boolean) => {
    if (!next) setAcknowledged(false);
    onOpenChange(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/70 backdrop-blur-sm" />
        <Dialog.Content
          className="mesh mesh-quiet fixed top-1/2 left-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 border-filament/40 bg-surface-raised p-8"
          style={{ background: 'var(--surface-raised)' }}
        >
          <span className="label-mono text-filament-ink">Consent required</span>
          <Dialog.Title className="mt-2 font-serif text-h3 text-text">{title}</Dialog.Title>
          <Dialog.Description className="mt-3 text-small text-text-2">
            {consequence}
          </Dialog.Description>

          <dl className="mt-6 flex flex-col divide-y divide-line border-y border-line">
            {disclosures.map((d) => (
              <div key={d.recipient} className="flex flex-col gap-2 py-4">
                <dt className="text-small text-text">{d.recipient}</dt>
                <dd className="flex flex-wrap gap-2">
                  {d.fields.map((f) => (
                    <span
                      key={f}
                      className="label-mono rounded-control border border-line px-2 py-1 text-text-2"
                    >
                      {f}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex items-start gap-3">
            <Checkbox.Root
              id={ackId}
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
              className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[2px] border border-filament data-[state=checked]:bg-filament-ink"
            >
              <Checkbox.Indicator>
                <svg aria-hidden width="10" height="10" viewBox="0 0 10 10">
                  <path
                    d="M2 5.2 4 7l4-4.5"
                    fill="none"
                    stroke="var(--on-filament)"
                    strokeWidth="1.5"
                  />
                </svg>
              </Checkbox.Indicator>
            </Checkbox.Root>
            <label htmlFor={ackId} className="text-small text-text-2">
              I understand who will see this. I can withdraw consent later, but it cannot be unseen.
            </label>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <Dialog.Close asChild>
              <Button variant="ghost">Not now</Button>
            </Dialog.Close>
            <Button
              variant="human"
              disabled={!acknowledged || pending}
              onClick={async () => {
                setPending(true);
                try {
                  await onConfirm();
                  change(false);
                } finally {
                  setPending(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
