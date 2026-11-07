import type { AnySpec, AnyState, Absorbed, Driver } from './engine';

const delayMs = () => {
  const v = Number(process.env.INTERVIEW_STREAM_DELAY_MS);
  return Number.isFinite(v) && v >= 0 ? v : 35;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function fieldOf(spec: AnySpec, key: string) {
  const f = spec.fields.find((x) => x.key === key);
  if (!f) throw new Error(`Unknown interview field: ${key}`);
  return f;
}

/** Offline extraction for one field. Shared by the offline driver and the live fallback. */
export function extractOffline(
  spec: AnySpec,
  state: AnyState,
  field: string,
  answer: string,
): Absorbed {
  const patch = fieldOf(spec, field).extract(answer, state.draft);
  return patch
    ? { patch: patch as Record<string, unknown>, vague: false }
    : { patch: {}, vague: true };
}

export function questionText(spec: AnySpec, field: string, followUp: boolean): string {
  const f = fieldOf(spec, field);
  return followUp ? f.followUp : f.question;
}

/**
 * Deterministic driver for dev, CI and e2e (no network). Questions come from the spec and are
 * streamed word by word so the interface behaves as it does with a live model.
 */
export const offlineDriver: Driver = {
  async absorb(spec, state, field, answer) {
    return extractOffline(spec, state, field, answer);
  },
  async *ask(spec, _state, field, followUp) {
    const words = questionText(spec, field, followUp).split(/(?<=\s)/);
    const ms = delayMs();
    for (const w of words) {
      if (ms) await sleep(ms);
      yield w;
    }
  },
};
