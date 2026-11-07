'use client';

import { Button, ConsentGate, MonoLabel, Status, Textarea } from '@cmobeat/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { callApi } from '@/components/profile/api';

type Response = 'pending' | 'interested' | 'declined' | 'question';

const answered: Record<Exclude<Response, 'pending'>, string> = {
  interested: 'You said you are interested',
  declined: 'You said this is not for you',
  question: 'Your question is with a talent partner',
};

/**
 * What a candidate can do with an approved match: answer it, decide on an introduction request
 * (through the Consent Gate), message after a reveal, or withdraw a reveal.
 */
export function CandidateMatchActions({
  matchId,
  roleTitle,
  response,
  pendingRequestId,
  revealedNow,
  revealed,
  recipient,
  fields,
}: {
  matchId: string;
  roleTitle: string;
  response: Response;
  pendingRequestId: string | null;
  revealedNow: boolean;
  revealed: boolean;
  recipient: string;
  fields: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [gate, setGate] = useState(false);
  const noteId = useId();

  async function run(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    const r = await callApi(url, { method: 'POST', body });
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-4">
      {pendingRequestId ? (
        <div className="flex flex-col gap-3 rounded-panel border border-filament/40 p-4">
          <Status tone="human">The company has asked to be introduced</Status>
          <p className="text-small text-text-2">
            They have seen this anonymised summary only. You decide whether they learn who you are.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="human" disabled={busy} onClick={() => setGate(true)}>
              Review the introduction
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(`/api/matches/reveal-requests/${pendingRequestId}/decision`, { accept: false })
              }
            >
              Decline
            </Button>
          </div>
          <ConsentGate
            open={gate}
            onOpenChange={setGate}
            title={`Introduce yourself for ${roleTitle}?`}
            consequence="If you agree, the company sees who you are and can message you here. You can withdraw later, which hides your details from them again."
            disclosures={[{ recipient, fields }]}
            confirmLabel="Introduce me"
            onConfirm={async () => {
              const ok = await run(`/api/matches/reveal-requests/${pendingRequestId}/decision`, {
                accept: true,
                acknowledged: true,
              });
              if (!ok) throw new Error('not saved');
            }}
          />
        </div>
      ) : null}

      {revealedNow ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="secondary">
            <Link href={`/me/matches/${matchId}/messages`}>Messages</Link>
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => run(`/api/matches/${matchId}/withdraw`, {})}
          >
            Withdraw introduction
          </Button>
        </div>
      ) : revealed ? (
        <MonoLabel>
          You withdrew this introduction. Your details are hidden from the company.
        </MonoLabel>
      ) : null}

      {!revealed && !pendingRequestId ? (
        response !== 'pending' && !asking ? (
          <div className="flex flex-wrap items-center gap-3">
            <Status tone="human">{answered[response]}</Status>
            <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
              Change answer
            </Button>
          </div>
        ) : asking ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const note = String(new FormData(e.currentTarget).get('note') ?? '');
              if (await run(`/api/matches/${matchId}/response`, { response: 'question', note }))
                setAsking(false);
            }}
          >
            <label htmlFor={noteId} className="label-mono">
              Your question for the talent partner (the company does not see it)
            </label>
            <Textarea id={noteId} name="note" rows={3} required minLength={3} maxLength={1000} />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy}>
                Send question
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button
              variant="human"
              disabled={busy}
              onClick={() => run(`/api/matches/${matchId}/response`, { response: 'interested' })}
            >
              I&apos;m interested
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => run(`/api/matches/${matchId}/response`, { response: 'declined' })}
            >
              Not for me
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setAsking(true)}>
              Ask a question
            </Button>
          </div>
        )
      ) : null}

      {error ? (
        <p role="alert" className="text-small text-critical-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
