import { Inngest } from 'inngest';

/**
 * Background jobs (spec 8.2). Each job's logic is a plain async function in lib/ so tests and
 * the staff console can run it directly; the Inngest functions here only schedule and retry it.
 */
export const inngest = new Inngest({ id: 'cmobeat' });
