'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { createKey, KeyError, revokeKey } from '@/lib/api-keys/keys';
import { apiScopes, type ApiScope } from '@/lib/api-keys/scopes';
import { getViewer } from '@/lib/auth';

export interface CreateKeyState {
  error?: string;
  /** The full key, returned once. Never stored or logged in clear. */
  created?: { key: string; name: string; prefix: string };
}

export async function createKeyAction(
  _prev: CreateKeyState,
  formData: FormData,
): Promise<CreateKeyState> {
  const scopes = apiScopes.filter((s) => formData.get(`scope:${s}`) === 'on') as ApiScope[];
  try {
    const k = await createKey(await getViewer(), {
      name: String(formData.get('name') ?? ''),
      scopes,
    });
    revalidatePath('/employer/api');
    return { created: { key: k.key, name: k.name, prefix: k.prefix } };
  } catch (e) {
    if (e instanceof KeyError) return { error: e.message };
    if (e instanceof ZodError) {
      const issue = e.issues[0];
      return {
        error:
          issue?.path[0] === 'scopes'
            ? 'Choose at least one thing the key may read.'
            : 'Give the key a name of 2 to 60 characters.',
      };
    }
    throw e;
  }
}

export async function revokeKeyAction(formData: FormData) {
  await revokeKey(await getViewer(), String(formData.get('id') ?? ''));
  revalidatePath('/employer/api');
}
