'use server';

import { headers } from 'next/headers';
import { clientIp } from '@/lib/newsletter/rate-limit';
import { confirm, signup, unsubscribe, updatePreferences } from '@/lib/newsletter/service';

export interface FormState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
}

function formToObject(form: FormData) {
  return {
    email: form.get('email'),
    market: form.get('market') || undefined,
    topics: form.getAll('topics').map(String),
    source: form.get('source') || undefined,
    website: form.get('website') || undefined,
  };
}

export async function signupAction(_prev: FormState, form: FormData): Promise<FormState> {
  const result = await signup(formToObject(form), { ip: clientIp(await headers()) });
  return result.ok
    ? { status: 'ok', message: 'Check your inbox to confirm. Nothing is sent until you do.' }
    : { status: 'error', message: result.message };
}

export async function confirmAction(_prev: FormState, form: FormData): Promise<FormState> {
  return (await confirm(form.get('token')))
    ? { status: 'ok', message: 'You are subscribed. A welcome email is on its way.' }
    : {
        status: 'error',
        message: 'This link has expired or was already used. Subscribe again to get a new one.',
      };
}

export async function preferencesAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ok = await updatePreferences(form.get('token'), {
    frequency: form.get('frequency'),
    topics: form.getAll('topics').map(String),
  });
  return ok
    ? { status: 'ok', message: 'Preferences saved.' }
    : { status: 'error', message: 'Those preferences could not be saved.' };
}

export async function unsubscribeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ok = await unsubscribe(form.get('token'));
  return ok
    ? { status: 'ok', message: 'You are unsubscribed. No further newsletters will be sent.' }
    : {
        status: 'error',
        message:
          'That link is not valid. If you keep receiving email, reply to it and we will remove you by hand.',
      };
}
