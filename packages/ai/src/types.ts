/**
 * Every agent call returns this.
 * - `ok: false, queued: true`: the model's output failed validation twice; a human_queue row exists.
 * - `ok: false, queued: false`: the input was unusable (empty, unsafe URL, unreadable page). Nothing
 *   ran; `reason` is safe to show the user. `runId` is "not-run".
 */
export type AgentResult<T> =
  | { ok: true; output: T; runId: string }
  | { ok: false; reason: string; runId: string; queued: boolean };
