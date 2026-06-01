import { describe, it, expect, beforeEach } from 'vitest';
import { signState, verifyState } from './oauth-state';

describe('oauth-state', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'test-secret-123';
  });

  it('round-trips a signed payload', () => {
    const signed = signState({ email: 'a@b.com', pageId: 'p1', timestamp: 123 });
    const out = verifyState<{ email: string; pageId: string; timestamp: number }>(signed);
    expect(out).toEqual({ email: 'a@b.com', pageId: 'p1', timestamp: 123 });
  });

  it('rejects a tampered payload (same signature, different body)', () => {
    const signed = signState({ email: 'a@b.com' });
    const sig = signed.split('.')[1];
    const forgedPayload = Buffer.from(JSON.stringify({ email: 'evil@b.com' })).toString('base64url');
    expect(verifyState(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it('rejects malformed state', () => {
    expect(verifyState('not-a-valid-state')).toBeNull();
    expect(verifyState('a.b.c')).toBeNull();
    expect(verifyState('')).toBeNull();
  });

  it('rejects a signature made with a different secret', () => {
    const signed = signState({ email: 'a@b.com' });
    process.env.NEXTAUTH_SECRET = 'a-different-secret';
    expect(verifyState(signed)).toBeNull();
  });

  it('throws when NEXTAUTH_SECRET is not configured', () => {
    const prev = process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    expect(() => signState({ email: 'a@b.com' })).toThrow();
    process.env.NEXTAUTH_SECRET = prev;
  });
});
