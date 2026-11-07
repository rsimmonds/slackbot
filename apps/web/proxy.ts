import { NextResponse, type NextRequest } from 'next/server';
import { areaForPath, canEnter } from './lib/areas';
import { SESSION_COOKIE, verifySession } from './lib/session-token';

/**
 * First wall: keep signed-out users and the wrong roles out of private areas.
 * Layouts re-check against the database (requireArea), and Postgres RLS is the third wall.
 */
async function devProxy(req: NextRequest) {
  const area = areaForPath(req.nextUrl.pathname);
  if (!area) return NextResponse.next();
  const session = await verifySession(
    req.cookies.get(SESSION_COOKIE)?.value,
    process.env.DEV_AUTH_SECRET ?? '',
  );
  if (!session) {
    const url = new URL('/sign-in', req.url);
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (!canEnter(area, session.roles)) return NextResponse.redirect(new URL('/dashboard', req.url));
  return NextResponse.next();
}

let clerkHandler:
  ((req: NextRequest, ev: unknown) => Promise<Response | undefined | void>) | undefined;

export default async function proxy(req: NextRequest, ev: unknown) {
  if (process.env.AUTH_MODE === 'clerk') {
    if (!clerkHandler) {
      const { clerkMiddleware, createRouteMatcher } = await import('@clerk/nextjs/server');
      const isPrivate = createRouteMatcher([
        '/account(.*)',
        '/me(.*)',
        '/employer(.*)',
        '/console(.*)',
      ]);
      clerkHandler = clerkMiddleware(async (auth, r) => {
        if (isPrivate(r)) await auth.protect();
      }) as unknown as typeof clerkHandler;
    }
    return clerkHandler!(req, ev);
  }
  return devProxy(req);
}

export const config = {
  matcher: ['/((?!_next|.*\\.(?:css|js|map|png|jpg|jpeg|svg|ico|woff2?|txt|xml)$).*)'],
};
