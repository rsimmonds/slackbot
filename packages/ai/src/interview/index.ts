import { providerName } from '../providers';
import type { Driver } from './engine';
import { liveDriver } from './live';
import { offlineDriver } from './offline';

export * from './types';
export {
  answerTurn,
  createSession,
  currentField,
  drain,
  finish,
  initialState,
  lastQuestion,
  loadSession,
  openingTurn,
  planNext,
  saveSession,
  sessionStateAad,
  SessionError,
  type Absorbed,
  type AnySpec,
  type AnyState,
  type Driver,
  type SessionEvent,
  type SessionRecord,
} from './engine';
export { specFor, registeredKinds } from './registry';
export { mandateSpec, type MandateDraft } from './specs/mandate';
export { offlineDriver, extractOffline } from './offline';
export { liveDriver } from './live';
export * as extract from './extract';

/** The Claude API when configured, otherwise the deterministic offline driver. */
export function driverFor(): Driver {
  return providerName() === 'anthropic' ? liveDriver : offlineDriver;
}
