import { brand } from '@cmobeat/config';
import { Button, MonoLabel, Status } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';
import { getViewer } from '@/lib/auth';
import { describeInvite } from '@/lib/billing/team';
import { AcceptForm } from './AcceptForm';

export const metadata: Metadata = { title: 'Team invitation', robots: { index: false } };

/** Accept a seat on an employer's hiring team. The token is single use and expires in 14 days. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[A-Za-z0-9_-]{40,64}$/.test(token);
  const invite = valid ? await describeInvite(token) : null;
  const viewer = await getViewer();

  return (
    <div className="mesh flex flex-col gap-6 p-8">
      <Wordmark />
      {!invite || !invite.open ? (
        <>
          <h1 className="font-serif text-h3 text-text">This invitation can’t be used.</h1>
          <p className="text-small text-text-2">
            It may have expired, been used already, or been withdrawn. Ask your teammate to send a
            new one.
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <MonoLabel>Team invitation</MonoLabel>
            <h1 className="font-serif text-h3 text-text">
              Join {invite.company} on {brand.name}.
            </h1>
            <p className="text-small text-text-2">
              {invite.inviter} invited <span className="numeric">{invite.maskedEmail}</span> to a
              seat on their hiring team. You’ll see their mandates, listings and shortlists.
              Candidate identities stay hidden until a candidate consents.
            </p>
          </div>
          {viewer ? (
            <>
              <Status tone="neutral">Signed in as {viewer.email}</Status>
              <AcceptForm token={token} />
            </>
          ) : (
            <Button asChild variant="human">
              <Link href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}>
                Sign in to accept
              </Link>
            </Button>
          )}
        </>
      )}
    </div>
  );
}
