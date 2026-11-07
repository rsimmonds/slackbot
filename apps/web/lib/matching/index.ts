import 'server-only';

/**
 * CONTRACT for the matching pipeline (Phase 3). The matching workstream implements this; the
 * review workstream calls it from the staff console ("Run matching for this mandate").
 *
 * Runs blind two-stage matching for one confirmed mandate: SQL hard filters (level, work type,
 * comp overlap, market, visibility, blocklist) → vector shortlist → the Matcher ranks and
 * explains up to 25 → `matches` rows with status 'proposed' (never approved here). Every
 * proposal writes agent_runs and audit_log. Idempotent: re-running does not duplicate a
 * proposal for the same mandate and profile.
 */
export interface ProposeResult {
  mandateId: string;
  considered: number;
  shortlisted: number;
  proposed: string[]; // new match ids
  skippedExisting: number;
}

export async function proposeMatchesForMandate(
  _mandateId: string,
  _opts: { actorId: string | null; searchId?: string | null },
): Promise<ProposeResult> {
  throw new Error('proposeMatchesForMandate is not implemented yet');
}
