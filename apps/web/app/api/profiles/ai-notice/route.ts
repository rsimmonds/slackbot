import { handle, signedIn } from '@/lib/profile/http';
import { acknowledgeAiNotice } from '@/lib/profile/profile';

/** POST /api/profiles/ai-notice — record that the candidate read the plain-language AI notice. */
export async function POST() {
  return handle(async () => ({ acknowledgedAt: await acknowledgeAiNotice(await signedIn()) }));
}
