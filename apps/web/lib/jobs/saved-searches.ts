import 'server-only';
import { savedSearches, type Tx } from '@cmobeat/db';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { filtersSchema, savedQuery, type JobFilters } from './filters';

export const frequencies = ['daily', 'weekly'] as const;

export const saveSearchInput = z.object({
  name: z.string().trim().min(1, 'Name your search').max(80),
  frequency: z.enum(frequencies),
  query: filtersSchema.omit({ page: true }),
});

export type SavedSearch = {
  id: string;
  name: string | null;
  query: Omit<JobFilters, 'page'>;
  alertFrequency: string;
  createdAt: Date;
};

/** Saved searches are owned rows: RLS lets a user read and write only their own. */
export async function createSavedSearch(
  tx: Tx,
  userId: string,
  input: z.infer<typeof saveSearchInput>,
) {
  const [row] = await tx
    .insert(savedSearches)
    .values({
      userId,
      name: input.name,
      alertFrequency: input.frequency,
      query: savedQuery({ ...input.query, page: 1 }),
    })
    .returning({ id: savedSearches.id });
  return row!.id;
}

export async function listSavedSearches(tx: Tx, userId: string): Promise<SavedSearch[]> {
  const rows = await tx
    .select({
      id: savedSearches.id,
      name: savedSearches.name,
      query: savedSearches.query,
      alertFrequency: savedSearches.alertFrequency,
      createdAt: savedSearches.createdAt,
    })
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(desc(savedSearches.createdAt));
  return rows.map((r) => ({ ...r, query: r.query as Omit<JobFilters, 'page'> }));
}

export async function deleteSavedSearch(tx: Tx, userId: string, id: string): Promise<boolean> {
  const rows = await tx
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)))
    .returning({ id: savedSearches.id });
  return rows.length > 0;
}
