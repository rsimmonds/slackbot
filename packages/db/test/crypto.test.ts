import { describe, expect, it } from 'vitest';
import {
  decryptField,
  decryptJson,
  encryptField,
  encryptJson,
  LocalKeyProvider,
} from '../src/crypto';

describe('field encryption', () => {
  it('round-trips text and JSON', async () => {
    const blob = await encryptField('sitting CMO, do not disclose');
    expect(blob[0]).toBe(1);
    expect(blob.toString('utf8')).not.toContain('sitting CMO');
    expect(await decryptField(blob)).toBe('sitting CMO, do not disclose');
    expect(await decryptJson(await encryptJson({ a: 1 }))).toEqual({ a: 1 });
  });

  it('uses a fresh data key and IV for every value', async () => {
    const a = await encryptField('same');
    const b = await encryptField('same');
    expect(a.equals(b)).toBe(false);
  });

  it('binds ciphertext to its AAD', async () => {
    const blob = await encryptField('x', { aad: 'candidate_profiles.contact:1' });
    expect(await decryptField(blob, { aad: 'candidate_profiles.contact:1' })).toBe('x');
    await expect(decryptField(blob, { aad: 'candidate_profiles.contact:2' })).rejects.toThrow();
    await expect(decryptField(blob)).rejects.toThrow();
  });

  it('rejects tampered ciphertext', async () => {
    const blob = await encryptField('hello');
    blob[blob.length - 1] = blob[blob.length - 1]! ^ 0xff;
    await expect(decryptField(blob)).rejects.toThrow();
  });

  it('rejects a different master key', async () => {
    const other = new LocalKeyProvider(Buffer.alloc(32, 7).toString('base64'));
    const blob = await encryptField('hello');
    await expect(decryptField(blob, { keyProvider: other })).rejects.toThrow();
  });

  it('rejects unknown versions and bad keys', async () => {
    await expect(decryptField(Buffer.from([2, 0, 0]))).rejects.toThrow(/version/);
    expect(() => new LocalKeyProvider('c2hvcnQ=')).toThrow(/32 bytes/);
  });
});
