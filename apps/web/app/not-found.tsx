import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      data-theme="lab"
      className="grain flex min-h-dvh flex-col items-center justify-center gap-6 px-4"
    >
      <span className="label-mono">404</span>
      <h1 className="font-serif text-h2 text-text">Nothing at this address.</h1>
      <Link
        href="/"
        className="text-small text-text-2 underline underline-offset-4 hover:text-text"
      >
        Return home
      </Link>
    </main>
  );
}
