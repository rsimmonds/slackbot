'use client';

import { Button, Input, MonoLabel, Status } from '@cmobeat/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { callApi } from './api';

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(iso),
  );

export function ExportControl({
  pending,
  latest,
}: {
  pending: boolean;
  latest: { createdAt: string; downloadUrl: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {latest ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
          <span className="text-small text-text">Export from {fmt(latest.createdAt)}</span>
          <a
            href={latest.downloadUrl}
            className="label-mono underline underline-offset-4 hover:text-text"
          >
            Download (link valid for 5 minutes)
          </a>
        </div>
      ) : null}
      {pending ? (
        <Status tone="machine">Preparing your export. We will email you when it is ready.</Status>
      ) : (
        <div>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await callApi('/api/profiles/export', { method: 'POST' });
              setBusy(false);
              if (r.error) setError(r.error);
              else router.refresh();
            }}
          >
            Request a copy of my data
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-small text-critical-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function DeleteControl({
  pending,
}: {
  pending: { createdAt: string; graceEndsAt: string; dueAt: string } | null;
}) {
  const router = useRouter();
  const inputId = useId();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pending)
    return (
      <div className="flex flex-col gap-4">
        <Status tone="critical">Deletion requested {fmt(pending.createdAt)}</Status>
        <p className="text-small text-text-2">
          Your profile is already hidden and anonymized. Your account will be permanently deleted
          after {fmt(pending.graceEndsAt)}, and no later than {fmt(pending.dueAt)}. Until then you
          can change your mind.
        </p>
        <div>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await callApi('/api/profiles/delete', { method: 'DELETE' });
              setBusy(false);
              if (r.error) setError(r.error);
              else router.refresh();
            }}
          >
            Keep my account
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-small text-critical-ink">
            {error}
          </p>
        ) : null}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-text-2">
        Immediately: your profile is hidden and stripped of everything that identifies you, your
        uploads are removed, your interviews end, every consent you gave is withdrawn, and you are
        signed out. After a 7-day grace period your account is permanently deleted. This cannot be
        undone after that.
      </p>
      <div className="flex max-w-sm flex-col gap-2">
        <label htmlFor={inputId} className="label-mono">
          Type “delete” to confirm
        </label>
        <Input
          id={inputId}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div>
        <Button
          variant="danger"
          disabled={busy || confirm.trim().toLowerCase() !== 'delete'}
          onClick={async () => {
            setBusy(true);
            const r = await callApi('/api/profiles/delete', { method: 'POST', body: { confirm } });
            setBusy(false);
            if (r.error) setError(r.error);
            else {
              router.push('/?deleted=1');
              router.refresh();
            }
          }}
        >
          Delete my account
        </Button>
      </div>
      <MonoLabel>
        Some records we are required to keep, such as the audit log of hiring decisions, no longer
        link to you.
      </MonoLabel>
      {error ? (
        <p role="alert" className="text-small text-critical-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
