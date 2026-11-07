import { signOut } from '@/app/(auth)/actions';

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="label-mono whitespace-nowrap rounded-control border border-line px-2 py-1 hover:text-text"
      >
        Sign out
      </button>
    </form>
  );
}
