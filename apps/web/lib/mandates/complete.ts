import 'server-only';
import { finish, type AnySpec, type SessionRecord } from '@cmobeat/ai/interview';
import type { MandateDocument } from '@cmobeat/ai/schemas';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { createFromSession } from './document';

/** Finish a Mandate Builder session: write the (unconfirmed) mandate and send the employer to it. */
export async function completeMandateSession(
  viewer: Viewer,
  rec: SessionRecord,
  spec: AnySpec,
): Promise<{ redirect: string; missing?: string[] }> {
  const result = finish<MandateDocument>(spec, rec.state);
  const doc = (result.ok ? result.output : spec.finalize(rec.state.draft)) as MandateDocument;
  const missing = result.ok ? [] : result.missing;
  const derived = result.ok ? result.derived : (spec.derivedFields?.(rec.state.draft) ?? []);
  const mandateId = await asViewer(viewer, (tx) =>
    createFromSession(tx, viewer, rec, doc, {
      derived,
      missing,
      ref: `${spec.refPrefix}-${rec.ref.slice(0, 4)}`,
    }),
  );
  return { redirect: `/employer/mandates/${mandateId}`, ...(missing.length ? { missing } : {}) };
}
