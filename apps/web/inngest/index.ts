import type { InngestFunction } from 'inngest';
import { dataDeletions, dataExports, profileRetention } from './data-rights';
import { listingExpiry, savedSearchAlerts } from './jobs';
import { movesSweep } from './moves-sweep';
import { fractionalInvoicing } from './searches';

/** Registry of every background function. Each workstream adds its functions here. */
export const functions: InngestFunction.Any[] = [
  // Moves Tracker
  movesSweep,
  // Job board
  savedSearchAlerts,
  listingExpiry,
  // Data rights (profile workstream)
  dataExports,
  dataDeletions,
  profileRetention,
  // Paid searches
  fractionalInvoicing,
];
