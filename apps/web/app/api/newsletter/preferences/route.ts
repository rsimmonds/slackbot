import { json, readBody } from '@/lib/newsletter/http';
import { getSubscription, maskEmail, updatePreferences } from '@/lib/newsletter/service';

/** GET ?token= → masked address, status and preferences. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  const sub = await getSubscription(token);
  if (!sub) return json({ ok: false, error: 'invalid_token' }, 404);
  return json({
    ok: true,
    email: maskEmail(sub.email),
    status: sub.status,
    preferences: sub.preferences,
  });
}

/** POST { token, frequency, topics[] } */
export async function POST(req: Request) {
  const { token, ...prefs } = await readBody(req);
  const topics = prefs.topics === undefined ? [] : [prefs.topics].flat();
  const ok = await updatePreferences(token, { frequency: prefs.frequency, topics });
  return ok ? json({ ok: true }) : json({ ok: false, error: 'invalid' }, 400);
}
