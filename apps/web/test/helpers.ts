import { devUsers } from '@cmobeat/db/dev-users';
import { testAuth } from './setup';

type Who = 'reader' | 'candidate' | 'employer' | 'editor' | 'talent' | 'admin';

/** Sign in as one of the seeded dev users (or sign out with null). */
export function signInAs(who: Who | null) {
  if (!who) {
    testAuth.viewer = null;
    return null;
  }
  const u = devUsers.find((d) => d.email === `${who}@sample.cmobeat.dev`)!;
  testAuth.viewer = { id: u.id, email: u.email, name: u.name, roles: [...u.roles] };
  return testAuth.viewer;
}

export const JD = `Chief Marketing Officer
Reports to the CEO. Team of 30.
Base $400,000 - $480,000
- Reposition the brand for the mid-market
- Build a demand engine the board trusts
- Hire a head of product marketing`;

export const jsonRequest = (
  url: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`http://localhost:3000${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
