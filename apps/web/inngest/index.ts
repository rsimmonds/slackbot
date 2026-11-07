import type { InngestFunction } from 'inngest';
import { listingExpiry, savedSearchAlerts } from './jobs';

/** Registry of every background function. Each workstream adds its functions here. */
export const functions: InngestFunction.Any[] = [
  // Jobs workstream
  savedSearchAlerts,
  listingExpiry,
];
