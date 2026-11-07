import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Envelope encryption for PII fields (resumes, contact details, comp history, transcripts, messages).
 *
 * Each value gets its own 256-bit data key (DEK). The DEK encrypts the value with AES-256-GCM and is
 * itself wrapped by a KeyProvider (a managed KMS in production, a local master key in dev/test).
 *
 * Blob format, version 1:
 *   [0]        version (0x01)
 *   [1..2]     wrapped DEK length, uint16 BE
 *   [3..n]     wrapped DEK (opaque to this module)
 *   [n..n+12]  IV
 *   [+16]      GCM auth tag
 *   [rest]     ciphertext
 *
 * Optional AAD binds a ciphertext to its location (e.g. "candidate_profiles.contact:<id>") so a blob
 * copied into another row fails to decrypt.
 */
export interface KeyProvider {
  readonly id: string;
  wrapKey(dek: Buffer): Promise<Buffer>;
  unwrapKey(wrapped: Buffer): Promise<Buffer>;
}

const VERSION = 0x01;
const IV_LEN = 12;
const TAG_LEN = 16;

/** Wraps DEKs with a 32-byte master key from env. Dev and test only; use a KMS provider in production. */
export class LocalKeyProvider implements KeyProvider {
  readonly id = 'local';
  readonly #key: Buffer;

  constructor(masterKeyBase64: string) {
    const key = Buffer.from(masterKeyBase64, 'base64');
    if (key.length !== 32)
      throw new Error('ENCRYPTION_MASTER_KEY must be 32 bytes, base64-encoded');
    this.#key = key;
  }

  async wrapKey(dek: Buffer): Promise<Buffer> {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.#key, iv);
    const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]);
  }

  async unwrapKey(wrapped: Buffer): Promise<Buffer> {
    const iv = wrapped.subarray(0, IV_LEN);
    const tag = wrapped.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', this.#key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(wrapped.subarray(IV_LEN + TAG_LEN)), decipher.final()]);
  }
}

let defaultProvider: KeyProvider | undefined;

export function setKeyProvider(provider: KeyProvider): void {
  defaultProvider = provider;
}

function provider(): KeyProvider {
  if (!defaultProvider) {
    const key = process.env.ENCRYPTION_MASTER_KEY;
    if (!key) throw new Error('ENCRYPTION_MASTER_KEY is not set and no KeyProvider was configured');
    defaultProvider = new LocalKeyProvider(key);
  }
  return defaultProvider;
}

export interface FieldOptions {
  aad?: string;
  keyProvider?: KeyProvider;
}

export async function encryptField(
  plaintext: string | Buffer,
  opts: FieldOptions = {},
): Promise<Buffer> {
  const kp = opts.keyProvider ?? provider();
  const dek = randomBytes(32);
  try {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', dek, iv);
    if (opts.aad) cipher.setAAD(Buffer.from(opts.aad, 'utf8'));
    const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    const ct = Buffer.concat([cipher.update(data), cipher.final()]);
    const wrapped = await kp.wrapKey(dek);
    if (wrapped.length > 0xffff) throw new Error('Wrapped key too large');
    const header = Buffer.alloc(3);
    header.writeUInt8(VERSION, 0);
    header.writeUInt16BE(wrapped.length, 1);
    return Buffer.concat([header, wrapped, iv, cipher.getAuthTag(), ct]);
  } finally {
    dek.fill(0);
  }
}

export async function decryptFieldToBuffer(blob: Buffer, opts: FieldOptions = {}): Promise<Buffer> {
  const kp = opts.keyProvider ?? provider();
  if (blob.length < 3 || blob.readUInt8(0) !== VERSION)
    throw new Error('Unknown encrypted field version');
  const wrappedLen = blob.readUInt16BE(1);
  let off = 3;
  const wrapped = blob.subarray(off, (off += wrappedLen));
  const iv = blob.subarray(off, (off += IV_LEN));
  const tag = blob.subarray(off, (off += TAG_LEN));
  const ct = blob.subarray(off);
  const dek = await kp.unwrapKey(wrapped);
  try {
    const decipher = createDecipheriv('aes-256-gcm', dek, iv);
    if (opts.aad) decipher.setAAD(Buffer.from(opts.aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } finally {
    dek.fill(0);
  }
}

export async function decryptField(blob: Buffer, opts: FieldOptions = {}): Promise<string> {
  return (await decryptFieldToBuffer(blob, opts)).toString('utf8');
}

export async function encryptJson(value: unknown, opts: FieldOptions = {}): Promise<Buffer> {
  return encryptField(JSON.stringify(value), opts);
}

export async function decryptJson<T>(blob: Buffer, opts: FieldOptions = {}): Promise<T> {
  return JSON.parse(await decryptField(blob, opts)) as T;
}
