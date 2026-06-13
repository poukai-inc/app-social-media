import { describe, it, expect, afterEach } from 'vitest';
import { verifyCronSecret, cronAuthError } from './cron-auth';

function req(authHeader?: string): Request {
  return new Request('https://example.com/api/cron/x', {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe('cron-auth', () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  describe('fail closed when CRON_SECRET unset', () => {
    it('verifyCronSecret returns false', () => {
      delete process.env.CRON_SECRET;
      expect(verifyCronSecret(req('Bearer anything'))).toBe(false);
    });
    it('cronAuthError reports misconfigured', () => {
      delete process.env.CRON_SECRET;
      expect(cronAuthError(req('Bearer anything'))).toBe('misconfigured');
    });
  });

  describe('with CRON_SECRET set', () => {
    it('accepts the matching bearer token', () => {
      process.env.CRON_SECRET = 's3cret';
      expect(verifyCronSecret(req('Bearer s3cret'))).toBe(true);
      expect(cronAuthError(req('Bearer s3cret'))).toBeNull();
    });
    it('rejects a wrong token', () => {
      process.env.CRON_SECRET = 's3cret';
      expect(verifyCronSecret(req('Bearer nope'))).toBe(false);
      expect(cronAuthError(req('Bearer nope'))).toBe('unauthorized');
    });
    it('rejects a missing header', () => {
      process.env.CRON_SECRET = 's3cret';
      expect(verifyCronSecret(req())).toBe(false);
      expect(cronAuthError(req())).toBe('unauthorized');
    });
    it('rejects a length-mismatched header without throwing', () => {
      process.env.CRON_SECRET = 's3cret';
      expect(verifyCronSecret(req('Bearer s3cret-longer'))).toBe(false);
    });
  });
});
