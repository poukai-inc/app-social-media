import crypto from 'crypto';
import { logger } from '@/lib/logger';

const log = logger.child('crypto-secret');

/**
 * Application-level secret encryption (AES-256-GCM) for values stored at rest,
 * e.g. user-supplied database connection strings. (review H5)
 *
 * Key: DATA_ENCRYPTION_KEY — 32 bytes, hex (64 chars) or base64. When the key
 * is NOT configured, encryptSecret is a pass-through and decryptSecret returns
 * its input unchanged, so the feature keeps working in environments without the
 * key. Ciphertext is self-describing (`enc:v1:` prefix), so decryptSecret also
 * transparently passes through legacy plaintext rows written before encryption
 * was enabled — no backfill migration required.
 */

const PREFIX = 'enc:v1:';

function getKey(): Buffer | null {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) return null;
  let key: Buffer;
  try {
    key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  } catch {
    return null;
  }
  if (key.length !== 32) {
    log.error('DATA_ENCRYPTION_KEY must decode to 32 bytes; ignoring (secrets will not be encrypted)');
    return null;
  }
  return key;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Encrypt a plaintext secret. No-op pass-through when no key is configured. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;
  if (isEncrypted(plaintext)) return plaintext; // already encrypted
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypt a value produced by encryptSecret. Values without the `enc:v1:`
 * prefix (legacy plaintext) are returned unchanged.
 */
export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value; // legacy plaintext
  const key = getKey();
  if (!key) {
    throw new Error('DATA_ENCRYPTION_KEY is required to decrypt an encrypted secret');
  }
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted secret');
  }
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
