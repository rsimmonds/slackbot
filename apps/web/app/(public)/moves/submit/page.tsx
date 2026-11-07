import { Button, MeshPanel, MonoLabel } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getViewer } from '@/lib/auth';
import { TipForm } from './TipForm';

export const metadata: Metadata = {
  title: 'Send a CMO move',
  description:
    'Tell us about a CMO appointment, departure or promotion. An editor checks every source.',
};

export default async function SubmitMovePage() {
  const viewer = await getViewer();
  return (
    <main className="relative mx-auto max-w-[1280px] px-4 pt-12 pb-24 md:px-8 md:pt-16">
      <div className="grid grid-cols-12 gap-8">
        <header className="col-span-12 flex flex-col gap-4 lg:col-span-5">
          <MonoLabel>CMO Moves · Tips</MonoLabel>
          <h1 className="font-serif text-h2 text-text md:text-h1">Seen a move in the seat?</h1>
          <p className="max-w-md text-body text-text-2">
            Send us an appointment, departure or promotion with a public source. The Moves Tracker
            reads it, and an editor confirms it before anything is published.
          </p>
        </header>
        <MeshPanel className="col-span-12 lg:col-span-7">
          {viewer ? (
            <TipForm />
          ) : (
            <div className="flex flex-col items-start gap-4">
              <p className="text-body text-text-2">
                Sign in to send a tip. It keeps the tracker free of spam.
              </p>
              <Button asChild>
                <Link href="/sign-in?next=%2Fmoves%2Fsubmit">Sign in</Link>
              </Button>
            </div>
          )}
        </MeshPanel>
      </div>
    </main>
  );
}
