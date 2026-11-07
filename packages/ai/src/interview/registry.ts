import type { AnySpec } from './engine';
import { mandateSpec } from './specs/mandate';
import type { SessionKind } from './types';

/**
 * kind → interview spec. To add an interview, write its spec and add one line here.
 * Kinds without a spec are rejected by the API with a 400.
 */
const specs: Partial<Record<SessionKind, AnySpec>> = {
  mandate: mandateSpec,
};

export function specFor(kind: SessionKind): AnySpec | null {
  return specs[kind] ?? null;
}

export const registeredKinds = (): SessionKind[] => Object.keys(specs) as SessionKind[];
