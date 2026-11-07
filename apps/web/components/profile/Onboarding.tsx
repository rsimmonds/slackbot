'use client';

import { Button, MonoLabel, SignalLine, Status } from '@cmobeat/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { callApi } from './api';

/** "7 Nov 2026": unambiguous in every market. */
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  );

export function AcknowledgeNotice({ acknowledgedAt }: { acknowledgedAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (acknowledgedAt)
    return <Status tone="human">Read and acknowledged {shortDate(acknowledgedAt)}</Status>;
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="human"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await callApi('/api/profiles/ai-notice', { method: 'POST' });
          setBusy(false);
          if (r.error) setError(r.error);
          else router.refresh();
        }}
      >
        I have read this
      </Button>
      {error ? (
        <p role="alert" className="text-small text-critical-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface UploadItem {
  id: string;
  purpose: 'resume' | 'linkedin_pdf';
  uploadedAt: string;
  pages: number;
  downloadUrl: string;
}

const purposeLabel = { resume: 'Résumé', linkedin_pdf: 'LinkedIn profile (PDF export)' } as const;

function UploadSlot({
  purpose,
  current,
  disabled,
}: {
  purpose: 'resume' | 'linkedin_pdf';
  current?: UploadItem;
  disabled: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'good' | 'critical'; text: string } | null>(null);

  async function onChange(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    if (file.size > 5 * 1024 * 1024)
      return setMessage({ tone: 'critical', text: 'Files must be 5 MB or smaller.' });
    setBusy(true);
    const form = new FormData();
    form.set('purpose', purpose);
    form.set('file', file);
    try {
      const res = await fetch('/api/profiles/uploads', { method: 'POST', body: form });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { removed: string[] };
        error?: string;
      };
      if (!res.ok) setMessage({ tone: 'critical', text: json.error ?? 'Upload failed.' });
      else {
        const removed = json.data?.removed ?? [];
        setMessage({
          tone: 'good',
          text: removed.length
            ? `Uploaded and encrypted. We left out details about ${removed.join(', ')}: they are never used.`
            : 'Uploaded and encrypted. Contact details were removed from what the interviewer reads.',
        });
        router.refresh();
      }
    } catch {
      setMessage({ tone: 'critical', text: 'Upload failed. Check your connection and try again.' });
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={id} className="text-small text-text">
          {purposeLabel[purpose]}
        </label>
        {current ? (
          <a
            href={current.downloadUrl}
            className="label-mono underline underline-offset-4 hover:text-text"
          >
            Download your copy
          </a>
        ) : (
          <MonoLabel>Optional · PDF · 5 MB</MonoLabel>
        )}
      </div>
      <input
        id={id}
        type="file"
        accept="application/pdf,.pdf"
        disabled={disabled || busy}
        onChange={(e) => onChange(e.target.files?.[0])}
        className="text-small text-text-2 file:mr-4 file:rounded-control file:border file:border-line-strong file:bg-transparent file:px-3 file:py-1.5 file:text-small file:text-text disabled:opacity-50"
      />
      {current ? (
        <MonoLabel>
          On file · {current.pages} page{current.pages === 1 ? '' : 's'} ·{' '}
          {shortDate(current.uploadedAt)}
        </MonoLabel>
      ) : null}
      {busy ? <SignalLine label="Encrypting and reading your file" /> : null}
      {message ? (
        <p
          role={message.tone === 'critical' ? 'alert' : 'status'}
          className={
            message.tone === 'critical'
              ? 'text-small text-critical-ink'
              : 'text-small text-good-ink'
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

export function Uploads({ items, disabled }: { items: UploadItem[]; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <UploadSlot
        purpose="resume"
        current={items.find((i) => i.purpose === 'resume')}
        disabled={disabled}
      />
      <UploadSlot
        purpose="linkedin_pdf"
        current={items.find((i) => i.purpose === 'linkedin_pdf')}
        disabled={disabled}
      />
    </div>
  );
}

export function BeginInterview({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="machine"
        size="lg"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await callApi<{ id?: string; sessionId?: string }>('/api/sessions', {
            method: 'POST',
            body: { kind: 'profile' },
          });
          const id = r.data?.id ?? r.data?.sessionId;
          if (r.error || !id) {
            setBusy(false);
            setError(r.error ?? 'The interview could not start. Please try again.');
            return;
          }
          router.push(`/me/interview/${id}`);
        }}
      >
        Begin interview
      </Button>
      {disabled ? <MonoLabel>Read the note above first</MonoLabel> : null}
      {error ? (
        <p role="alert" className="text-small text-critical-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
