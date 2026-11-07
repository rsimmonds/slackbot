import { body, handle, signedIn } from '@/lib/profile/http';
import { setVisibility, visibilitySchema } from '@/lib/profile/visibility';

/**
 * PATCH /api/profiles/visibility — { visibility, consent }.
 * Widening needs consent: true (given in the Consent Gate). Narrowing is instant.
 */
export async function PATCH(req: Request) {
  return handle(async () => setVisibility(await signedIn(), await body(req, visibilitySchema)));
}
