import type { InngestFunction } from 'inngest';
import { listingExpiry, savedSearchAlerts } from './jobs';
import { movesSweep } from './moves-sweep';

/** Registry of every background function. Each workstream adds its functions here. */
export const functions: InngestFunction.Any[] = [
  // Moves Tracker
  movesSweep,
  // Job board
  savedSearchAlerts,
  listingExpiry,
];
