/**
 * Every agent call returns this. `ok: false` means the output failed validation twice and the
 * input was sent to the human queue (spec 7.1.1).
 */
export type AgentResult<T> =
  | { ok: true; output: T; runId: string }
  | { ok: false; reason: string; runId: string; queued: true };
