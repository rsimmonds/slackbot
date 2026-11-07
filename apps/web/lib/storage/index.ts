import 'server-only';
import { createHash } from 'node:crypto';
import { decryptField, decryptFieldToBuffer, encryptField, files, type Tx } from '@cmobeat/db';
import { and, eq, isNull } from 'drizzle-orm';

/**
 * Encrypted file storage (spec 8.5.2). Bytes are encrypted before they leave this process, with
 * the file id as additional authenticated data, so a ciphertext can't be swapped between rows.
 *
 * STORAGE_PROVIDER=local (default) keeps the encrypted bytes in the `files` table.
 * STORAGE_PROVIDER=supabase will keep them in a private Supabase Storage bucket (stub until the
 * account exists). Either way, files are only ever served through signed, short-lived URLs to
 * their owner (see signed-url.ts). All reads go through the caller's transaction, so RLS applies.
 */

export type FilePurpose = typeof files.$inferInsert.purpose;

export interface StoredFile {
  id: string;
  purpose: FilePurpose;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
}

export interface PutInput {
  ownerId: string;
  purpose: FilePurpose;
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

export interface StorageProvider {
  readonly name: 'local' | 'supabase';
  put(tx: Tx, input: PutInput): Promise<StoredFile>;
  /** Returns null when the file doesn't exist or isn't visible to the transaction's user. */
  get(tx: Tx, id: string): Promise<(StoredFile & { bytes: Buffer }) | null>;
  /** Soft delete. Hard deletion happens in the data-rights jobs. */
  remove(tx: Tx, id: string): Promise<void>;
}

const aad = (id: string) => `file:${id}`;

export const localProvider: StorageProvider = {
  name: 'local',
  async put(tx, input) {
    const id = crypto.randomUUID();
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    const [row] = await tx
      .insert(files)
      .values({
        id,
        ownerId: input.ownerId,
        purpose: input.purpose,
        filename: await encryptField(input.filename, { aad: aad(id) }),
        mimeType: input.mimeType,
        sizeBytes: input.bytes.length,
        sha256,
        provider: 'local',
        content: await encryptField(input.bytes, { aad: aad(id) }),
      })
      .returning({ createdAt: files.createdAt });
    return {
      id,
      purpose: input.purpose,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.length,
      sha256,
      createdAt: row!.createdAt,
    };
  },
  async get(tx, id) {
    const [row] = await tx
      .select()
      .from(files)
      .where(and(eq(files.id, id), isNull(files.deletedAt)))
      .limit(1);
    if (!row?.content) return null;
    return {
      id: row.id,
      purpose: row.purpose,
      filename: await decryptField(row.filename, { aad: aad(row.id) }),
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      createdAt: row.createdAt,
      bytes: await decryptFieldToBuffer(row.content, { aad: aad(row.id) }),
    };
  },
  async remove(tx, id) {
    await tx.update(files).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(files.id, id));
  },
};

/**
 * Supabase Storage provider: private bucket, server-side uploads with the service role, bytes
 * encrypted by us before upload (Supabase never sees plaintext). Not wired until the project
 * exists; configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STORAGE_BUCKET.
 */
export const supabaseProvider: StorageProvider = {
  name: 'supabase',
  async put() {
    throw new Error('Supabase Storage is not configured yet. Set STORAGE_PROVIDER=local.');
  },
  async get() {
    throw new Error('Supabase Storage is not configured yet. Set STORAGE_PROVIDER=local.');
  },
  async remove() {
    throw new Error('Supabase Storage is not configured yet. Set STORAGE_PROVIDER=local.');
  },
};

export function storage(): StorageProvider {
  return process.env.STORAGE_PROVIDER === 'supabase' ? supabaseProvider : localProvider;
}

/** Decrypted filename for display, from a row the caller can already see. */
export async function displayName(row: { id: string; filename: Buffer }): Promise<string> {
  return decryptField(row.filename, { aad: aad(row.id) });
}
