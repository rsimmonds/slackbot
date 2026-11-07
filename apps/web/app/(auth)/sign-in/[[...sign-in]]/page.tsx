import type { Metadata } from 'next';
import { brand } from '@cmobeat/config';
import { Iris, MonoLabel, Status } from '@cmobeat/ui';
import { authMode } from '@/lib/auth';
import { Wordmark } from '@/components/Wordmark';
import { devSignIn } from '../../actions';
import { listDevUsers } from '@/lib/users';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = '', error } = await searchParams;

  if (authMode() === 'clerk') {
    const { SignIn } = await import('@clerk/nextjs');
    return (
      <div className="flex flex-col items-center gap-8">
        <Wordmark />
        <SignIn />
      </div>
    );
  }

  const users = await listDevUsers();
  return (
    <div className="mesh flex flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <Wordmark />
        <Iris state="idle" size={40} />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-h3 text-text">Sign in to {brand.name}</h1>
        <p className="text-small text-text-2">
          Local development sign-in. Choose a sample user for each role. In production this page is
          Clerk, with magic links, Google and Microsoft.
        </p>
        <Status tone="human">Dev mode · sample data</Status>
      </div>
      {error === 'unknown' ? (
        <p role="alert" className="text-small text-critical-ink">
          That user does not exist. Run the seed script.
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {users.map((u) => (
          <li key={u.email}>
            <form action={devSignIn} className="flex items-center justify-between gap-4 py-3">
              <input type="hidden" name="email" value={u.email} />
              <input type="hidden" name="next" value={next} />
              <span className="flex flex-col">
                <span className="text-small text-text">{u.name}</span>
                <MonoLabel>{u.roles.join(' · ')}</MonoLabel>
                <span className="text-micro text-text-3">{u.description}</span>
              </span>
              <button
                type="submit"
                className="label-mono rounded-control border border-line-strong px-3 py-1.5 text-text hover:border-synapse"
                aria-label={`Sign in as ${u.name}`}
              >
                Sign in
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
