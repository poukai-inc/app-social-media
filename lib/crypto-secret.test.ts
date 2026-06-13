import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { encryptSecret, decryptSecret, isEncrypted } from './crypto-secret';

const KEY = crypto.randomBytes(32).toString('hex');

describe('crypto-secret', () => {
  const original = process.env.DATA_ENCRYPTION_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = original;
  });

  describe('with a key configured', () => {
    beforeEach(() => {
      process.env.DATA_ENCRYPTION_KEY = KEY;
    });

    it('round-trips a secret', () => {
      const plain = 'mysql://user:p@ss@db.example.com:3306/app';
      const enc = encryptSecret(plain);
      expect(enc).not.toBe(plain);
      expect(isEncrypted(enc)).toBe(true);
      expect(decryptSecret(enc)).toBe(plain);
    });

    it('produces a different ciphertext each time (random IV)', () => {
      expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
    });

    it('does not double-encrypt', () => {
      const enc = encryptSecret('x');
      expect(encryptSecret(enc)).toBe(enc);
    });

    it('passes through legacy plaintext on decrypt', () => {
      expect(decryptSecret('legacy-plaintext-conn-string')).toBe('legacy-plaintext-conn-string');
    });

    it('throws on tampered ciphertext (auth tag)', () => {
      const enc = encryptSecret('secret');
      const tampered = `${enc}AA`;
      expect(() => decryptSecret(tampered)).toThrow();
    });
  });

  describe('without a key configured', () => {
    beforeEach(() => {
      delete process.env.DATA_ENCRYPTION_KEY;
    });

    it('encrypt is a pass-through', () => {
      expect(encryptSecret('plain')).toBe('plain');
    });

    it('decrypt passes through plaintext', () => {
      expect(decryptSecret('plain')).toBe('plain');
    });
  });
});
