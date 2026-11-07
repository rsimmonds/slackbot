'use server';

import { homeFor } from '@cmobeat/config';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { authMode, endDevSession, startDevSession } from '@/lib/auth';
import { findUserByEmail } from '@/lib/users';

const signInSchema = z.object({
  email: z.email(),
  next: z
    .string()
    .regex(/^\/(?!\/)/, 'relative path only')
    .optional()
    .or(z.literal('')),
});

/** Local dev sign-in as a seeded sample user. Disabled whenever Clerk is configured. */
export async function devSignIn(formData: FormData) {
  if (authMode() !== 'dev') throw new Error('Dev sign-in is disabled');
  const { email, next } = signInSchema.parse({
    email: formData.get('email'),
    next: formData.get('next') ?? '',
  });
  const user = await findUserByEmail(email);
  if (!user) redirect('/sign-in?error=unknown');
  await startDevSession(user);
  redirect(next || homeFor(user.roles));
}

export async function signOut() {
  if (authMode() === 'dev') await endDevSession();
  redirect('/');
}
