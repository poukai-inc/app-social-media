import { describe, it, expect } from 'vitest';
import { uploadOwnerToken, uploadKeyPrefix } from './upload-owner';

describe('upload-owner', () => {
  it('derives a stable token from user id', () => {
    const a = uploadOwnerToken({ user: { id: 'user-1' } });
    const b = uploadOwnerToken({ user: { id: 'user-1' } });
    expect(a).toBe(b);
    expect(a).toBeTruthy();
  });

  it('gives different tokens to different users', () => {
    expect(uploadOwnerToken({ user: { id: 'a' } })).not.toBe(
      uploadOwnerToken({ user: { id: 'b' } }),
    );
  });

  it('falls back to email (case-insensitive) when id absent', () => {
    const lower = uploadOwnerToken({ user: { email: 'me@example.com' } });
    const upper = uploadOwnerToken({ user: { email: 'ME@EXAMPLE.COM' } });
    expect(lower).toBe(upper);
    expect(lower).toBeTruthy();
  });

  it('returns null for an unidentifiable session', () => {
    expect(uploadOwnerToken(null)).toBeNull();
    expect(uploadOwnerToken({ user: {} })).toBeNull();
  });

  it('does not leak the raw identifier in the token or prefix', () => {
    const token = uploadOwnerToken({ user: { id: 'secret-user-id' } })!;
    expect(token).not.toContain('secret-user-id');
    expect(uploadKeyPrefix(token)).toBe(`media/${token}/`);
  });
});
