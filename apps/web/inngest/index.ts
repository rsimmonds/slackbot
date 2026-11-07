import type { InngestFunction } from 'inngest';
import { careerDigestWeekly } from './billing';
import { dataDeletions, dataExports, profileRetention } from './data-rights';
import { listingExpiry, savedSearchAlerts } from './jobs';
import {
  fairnessWeekly,
  matchNightly,
  matchOnMandateConfirmed,
  matchOnProfileVisible,
} from './matching';
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
  // Matching (proposes only; a talent partner approves)
  matchOnMandateConfirmed,
  matchOnProfileVisible,
  matchNightly,
  fairnessWeekly,
  // Career digest (subscriptions workstream)
  careerDigestWeekly,
];
